// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PropertyRegistry
 * @notice Minimal on-chain registry of real estate properties. Each property records a
 *         physical address, an owner and an asking price. Ownership can be handed over to
 *         another wallet, and every property is publicly readable.
 *
 * @dev SECURITY MODEL
 *
 *      1. No privileged roles. There is no admin, owner, upgrade path or pause switch, so
 *         there is no key whose compromise would put the registry at risk. Every property is
 *         controlled solely by the wallet that currently owns it.
 *
 *      2. No value custody. The contract is not payable and defines no `receive` or
 *         `fallback`, so it cannot hold or move POL/ERC-20s. Plain transfers to it revert.
 *         There are no funds to loot, and no withdrawal path to exploit.
 *
 *      3. Per-property authorisation. `transferOwnership` is gated on
 *         `msg.sender == property.owner`, which is checked against storage on every call.
 *         Nothing is keyed on `tx.origin`, and there is no operator or approval concept, so
 *         one owner can never reach another owner's property.
 *
 *      4. No reentrancy surface. No function makes an external call or transfers value, so
 *         no state is exposed mid-execution. State is written before events are emitted
 *         (checks-effects-interactions) regardless.
 *
 *      5. Bounded input. The physical address is length-capped and the price is range-checked
 *         so that no caller can inflate another user's read costs or overflow the packed slot.
 *
 *      6. Two-step transfer. {transferOwnership} moves a property immediately, as specified.
 *         {initiateTransfer} / {acceptTransfer} are also provided so that a high-value
 *         handover cannot be lost to a mistyped recipient: the property only moves once the
 *         receiving wallet proves it controls its key.
 *
 *      KNOWN LIMITATION, stated plainly: this is a permissionless registry. It proves who
 *      registered a string and who controls it on chain — it cannot prove real-world legal
 *      title. Duplicate registrations of the same address string are rejected, but a real
 *      deployment would still gate {registerProperty} behind a verified-notary role.
 *
 * @dev GAS
 *      Storage is deliberately packed: `owner` (20 bytes) + `price` (12 bytes) share one
 *      slot. The price ceiling that buys this packing is `type(uint96).max` (~7.9e28),
 *      enforced in {registerProperty}.
 */
contract PropertyRegistry {
    // ---------------------------------------------------------------------
    // Errors (cheaper than revert strings, and self-documenting)
    // ---------------------------------------------------------------------

    /// @notice The physical address string was empty.
    error EmptyPhysicalAddress();

    /// @notice The physical address string exceeds {MAX_PHYSICAL_ADDRESS_LENGTH} bytes.
    error PhysicalAddressTooLong(uint256 length);

    /// @notice This exact address string is already registered, under `existingPropertyId`.
    error AddressAlreadyRegistered(uint256 existingPropertyId);

    /// @notice A property cannot be registered with a price of zero.
    error ZeroPrice();

    /// @notice The price exceeds the packed uint96 ceiling.
    error PriceOverflow(uint256 price);

    /// @notice No property has ever been registered under `propertyId`.
    error PropertyDoesNotExist(uint256 propertyId);

    /// @notice `caller` is not the current owner of `propertyId`.
    error NotPropertyOwner(uint256 propertyId, address caller);

    /// @notice The new owner is the zero address, this contract, or already the owner.
    error InvalidNewOwner(address newOwner);

    /// @notice `caller` is not the wallet the outgoing owner nominated.
    error NotPendingOwner(uint256 propertyId, address caller);

    /// @notice There is no pending transfer to act on for `propertyId`.
    error NoPendingTransfer(uint256 propertyId);

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Upper bound on the stored address string, in bytes.
    /// @dev Caps the SSTOREs one registration can force, and the memory any reader must
    ///      allocate for it. Generous for a postal address in any locale.
    uint256 public constant MAX_PHYSICAL_ADDRESS_LENGTH = 256;

    /// @notice Largest page {getProperties} will return in one call.
    uint256 public constant MAX_PAGE_SIZE = 100;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Property {
        string physicalAddress; // slot n   (dynamic)
        address owner;          // slot n+1 (20 bytes) -- packed
        uint96 price;           // slot n+1 (12 bytes) -- packed
        uint64 registeredAt;    // slot n+2 (8 bytes)
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @dev Ids are 1-based so that 0 unambiguously means "not registered".
    uint256 private _propertyCount;

    mapping(uint256 propertyId => Property) private _properties;

    /// @dev keccak256(physicalAddress) => propertyId. Blocks duplicate registrations.
    mapping(bytes32 addressHash => uint256 propertyId) private _propertyIdByAddress;

    /// @dev Nominated recipient of a two-step transfer. Kept out of {Property} so that the
    ///      common path — a property with no pending transfer — costs nothing to store.
    mapping(uint256 propertyId => address pendingOwner) private _pendingOwner;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice Emitted once per property, when it first enters the registry.
    event PropertyRegistered(
        uint256 indexed propertyId,
        address indexed owner,
        string physicalAddress,
        uint256 price,
        uint256 registeredAt
    );

    /// @notice Emitted every time a property changes hands, by either transfer path.
    event OwnershipTransferred(
        uint256 indexed propertyId,
        address indexed previousOwner,
        address indexed newOwner,
        uint256 transferredAt
    );

    /// @notice Emitted when an owner nominates a recipient for a two-step transfer.
    event TransferInitiated(
        uint256 indexed propertyId,
        address indexed currentOwner,
        address indexed pendingOwner
    );

    /// @notice Emitted when an owner withdraws a nomination made by {initiateTransfer}.
    event TransferCancelled(uint256 indexed propertyId, address indexed cancelledOwner);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    /// @dev A property exists iff it has a non-zero owner. Ownership can never return to
    ///      the zero address, so this stays true for the life of the registry.
    modifier propertyExists(uint256 _propertyId) {
        if (_properties[_propertyId].owner == address(0)) {
            revert PropertyDoesNotExist(_propertyId);
        }
        _;
    }

    /// @dev The single authorisation check in the contract. Reads the owner from storage
    ///      every time — never from a cached, caller-supplied or `tx.origin` value.
    modifier onlyPropertyOwner(uint256 _propertyId) {
        address currentOwner = _properties[_propertyId].owner;
        if (currentOwner == address(0)) revert PropertyDoesNotExist(_propertyId);
        if (msg.sender != currentOwner) revert NotPropertyOwner(_propertyId, msg.sender);
        _;
    }

    // ---------------------------------------------------------------------
    // Registration
    // ---------------------------------------------------------------------

    /**
     * @notice Register a new property owned by the caller.
     * @param _physicalAddress Human readable address of the property. Must be unique;
     *        callers should trim and normalise whitespace before submitting.
     * @param _price Asking price, in the smallest unit (wei-style fixed point).
     * @return propertyId The 1-based id assigned to the new property.
     */
    function registerProperty(string memory _physicalAddress, uint256 _price)
        external
        returns (uint256 propertyId)
    {
        uint256 addressLength = bytes(_physicalAddress).length;
        if (addressLength == 0) revert EmptyPhysicalAddress();
        if (addressLength > MAX_PHYSICAL_ADDRESS_LENGTH) {
            revert PhysicalAddressTooLong(addressLength);
        }
        if (_price == 0) revert ZeroPrice();
        if (_price > type(uint96).max) revert PriceOverflow(_price);

        bytes32 addressHash = keccak256(bytes(_physicalAddress));
        uint256 existingPropertyId = _propertyIdByAddress[addressHash];
        if (existingPropertyId != 0) revert AddressAlreadyRegistered(existingPropertyId);

        unchecked {
            // Cannot realistically overflow: one increment per transaction.
            propertyId = ++_propertyCount;
        }

        _properties[propertyId] = Property({
            physicalAddress: _physicalAddress,
            owner: msg.sender,
            price: uint96(_price),
            registeredAt: uint64(block.timestamp)
        });
        _propertyIdByAddress[addressHash] = propertyId;

        emit PropertyRegistered(propertyId, msg.sender, _physicalAddress, _price, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Ownership transfer — direct
    // ---------------------------------------------------------------------

    /**
     * @notice Hand a property over to another wallet immediately.
     * @dev Only the current owner may call this. Any pending two-step transfer is cleared,
     *      so a stale nomination can never be redeemed against the new owner.
     * @param _propertyId Id of the property to transfer.
     * @param _newOwner Wallet that becomes the new owner.
     */
    function transferOwnership(uint256 _propertyId, address _newOwner)
        external
        onlyPropertyOwner(_propertyId)
    {
        _validateNewOwner(_propertyId, _newOwner);
        _transfer(_propertyId, _newOwner);
    }

    // ---------------------------------------------------------------------
    // Ownership transfer — two-step (safer for high-value handovers)
    // ---------------------------------------------------------------------

    /**
     * @notice Nominate a wallet to receive a property. Nothing moves until the nominee
     *         calls {acceptTransfer}, so a mistyped or unreachable address is recoverable.
     * @param _propertyId Id of the property to transfer.
     * @param _newOwner Wallet nominated to take ownership.
     */
    function initiateTransfer(uint256 _propertyId, address _newOwner)
        external
        onlyPropertyOwner(_propertyId)
    {
        _validateNewOwner(_propertyId, _newOwner);

        _pendingOwner[_propertyId] = _newOwner;

        emit TransferInitiated(_propertyId, msg.sender, _newOwner);
    }

    /**
     * @notice Withdraw a nomination made by {initiateTransfer}.
     * @param _propertyId Id of the property whose pending transfer is being cancelled.
     */
    function cancelTransfer(uint256 _propertyId) external onlyPropertyOwner(_propertyId) {
        if (_pendingOwner[_propertyId] == address(0)) revert NoPendingTransfer(_propertyId);

        delete _pendingOwner[_propertyId];

        emit TransferCancelled(_propertyId, msg.sender);
    }

    /**
     * @notice Claim a property that its owner nominated you to receive.
     * @dev Proves the recipient controls the key before the property moves.
     * @param _propertyId Id of the property being claimed.
     */
    function acceptTransfer(uint256 _propertyId) external propertyExists(_propertyId) {
        address nominee = _pendingOwner[_propertyId];
        if (nominee == address(0)) revert NoPendingTransfer(_propertyId);
        if (msg.sender != nominee) revert NotPendingOwner(_propertyId, msg.sender);

        _transfer(_propertyId, nominee);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /**
     * @notice Read the full details of a property. Callable by anyone.
     * @param _propertyId Id of the property.
     * @return physicalAddress Human readable address.
     * @return owner Current owner.
     * @return price Asking price, in the smallest unit.
     * @return registeredAt Unix timestamp of registration.
     */
    function getProperty(uint256 _propertyId)
        external
        view
        propertyExists(_propertyId)
        returns (string memory physicalAddress, address owner, uint256 price, uint256 registeredAt)
    {
        Property storage property = _properties[_propertyId];
        return (property.physicalAddress, property.owner, property.price, property.registeredAt);
    }

    /// @notice Current owner of a property.
    function ownerOf(uint256 _propertyId)
        external
        view
        propertyExists(_propertyId)
        returns (address)
    {
        return _properties[_propertyId].owner;
    }

    /// @notice Wallet nominated to receive a property, or the zero address if none is pending.
    function pendingOwnerOf(uint256 _propertyId) external view returns (address) {
        return _pendingOwner[_propertyId];
    }

    /// @notice Total number of properties ever registered (also the highest valid id).
    function propertyCount() external view returns (uint256) {
        return _propertyCount;
    }

    /// @notice Convenience check used by the frontend before reading a property.
    function isRegistered(uint256 _propertyId) external view returns (bool) {
        return _properties[_propertyId].owner != address(0);
    }

    /// @notice Id registered against an address string, or 0 if it is still free.
    function propertyIdByAddress(string calldata _physicalAddress)
        external
        view
        returns (uint256)
    {
        return _propertyIdByAddress[keccak256(bytes(_physicalAddress))];
    }

    /**
     * @notice Page through the registry. Intended for off-chain readers.
     * @param _offset 1-based id to start from.
     * @param _limit Maximum number of properties to return, clamped to {MAX_PAGE_SIZE}.
     * @dev View-only, and the page size is bounded, so a caller cannot force an
     *      unbounded loop on an RPC node.
     */
    function getProperties(uint256 _offset, uint256 _limit)
        external
        view
        returns (Property[] memory page)
    {
        uint256 total = _propertyCount;
        if (_offset == 0 || _offset > total || _limit == 0) {
            return new Property[](0);
        }

        uint256 size = _limit > MAX_PAGE_SIZE ? MAX_PAGE_SIZE : _limit;
        uint256 available = total - _offset + 1;
        if (size > available) size = available;

        page = new Property[](size);
        for (uint256 i = 0; i < size; ++i) {
            page[i] = _properties[_offset + i];
        }
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Rejects recipients that would strand a property: the zero address (which would
    ///      also break the existence invariant), the registry itself (which has no way to
    ///      call its own functions), and a no-op transfer to the current owner.
    function _validateNewOwner(uint256 _propertyId, address _newOwner) private view {
        if (
            _newOwner == address(0) ||
            _newOwner == address(this) ||
            _newOwner == _properties[_propertyId].owner
        ) {
            revert InvalidNewOwner(_newOwner);
        }
    }

    /// @dev Single write path for ownership. Always clears any pending nomination so that
    ///      one cannot be redeemed after the property has moved on.
    function _transfer(uint256 _propertyId, address _newOwner) private {
        Property storage property = _properties[_propertyId];
        address previousOwner = property.owner;

        property.owner = _newOwner;

        if (_pendingOwner[_propertyId] != address(0)) {
            delete _pendingOwner[_propertyId];
        }

        emit OwnershipTransferred(_propertyId, previousOwner, _newOwner, block.timestamp);
    }
}
