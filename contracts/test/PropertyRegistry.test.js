const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const ONE_ETHER = ethers.parseEther('1');
const SAMPLE_ADDRESS = '12 Admiralty Way, Lekki Phase 1, Lagos';
const UINT96_MAX = 2n ** 96n - 1n;

describe('PropertyRegistry', function () {
  // Deployed once and snapshotted; every test gets a pristine copy.
  async function deployRegistryFixture() {
    const [owner, buyer, stranger, attacker] = await ethers.getSigners();
    const registry = await ethers.deployContract('PropertyRegistry');
    await registry.waitForDeployment();
    return { registry, owner, buyer, stranger, attacker };
  }

  // A registry that already holds one property owned by `owner` (id 1).
  async function registryWithPropertyFixture() {
    const ctx = await loadFixture(deployRegistryFixture);
    await ctx.registry.registerProperty(SAMPLE_ADDRESS, ONE_ETHER);
    return { ...ctx, propertyId: 1n };
  }

  describe('deployment', function () {
    it('starts with an empty registry', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      expect(await registry.propertyCount()).to.equal(0n);
    });

    it('exposes the documented input bounds as constants', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      expect(await registry.MAX_PHYSICAL_ADDRESS_LENGTH()).to.equal(256n);
      expect(await registry.MAX_PAGE_SIZE()).to.equal(100n);
    });
  });

  describe('registerProperty', function () {
    it('registers a property and stores every field', async function () {
      const { registry, owner } = await loadFixture(deployRegistryFixture);

      await registry.registerProperty(SAMPLE_ADDRESS, ONE_ETHER);

      const [physicalAddress, storedOwner, price, registeredAt] = await registry.getProperty(1);
      expect(physicalAddress).to.equal(SAMPLE_ADDRESS);
      expect(storedOwner).to.equal(owner.address);
      expect(price).to.equal(ONE_ETHER);
      expect(registeredAt).to.equal(await time.latest());
      expect(await registry.propertyCount()).to.equal(1n);
      expect(await registry.isRegistered(1)).to.equal(true);
    });

    it('emits PropertyRegistered with the assigned id', async function () {
      const { registry, owner } = await loadFixture(deployRegistryFixture);

      const tx = await registry.registerProperty(SAMPLE_ADDRESS, ONE_ETHER);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(registry, 'PropertyRegistered')
        .withArgs(1n, owner.address, SAMPLE_ADDRESS, ONE_ETHER, block.timestamp);
    });

    it('returns the new id to an on-chain caller', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      // staticCall exercises the return value, which a transaction receipt cannot expose.
      expect(await registry.registerProperty.staticCall(SAMPLE_ADDRESS, ONE_ETHER)).to.equal(1n);
    });

    it('assigns sequential 1-based ids across different callers', async function () {
      const { registry, owner, buyer } = await loadFixture(deployRegistryFixture);

      await registry.connect(owner).registerProperty('Property A', ONE_ETHER);
      await registry.connect(buyer).registerProperty('Property B', ONE_ETHER * 2n);

      expect(await registry.propertyCount()).to.equal(2n);
      expect((await registry.getProperty(1)).owner).to.equal(owner.address);
      expect((await registry.getProperty(2)).owner).to.equal(buyer.address);
    });

    it('indexes the property by its address hash', async function () {
      const { registry } = await loadFixture(registryWithPropertyFixture);

      expect(await registry.propertyIdByAddress(SAMPLE_ADDRESS)).to.equal(1n);
      expect(await registry.propertyIdByAddress('somewhere else')).to.equal(0n);
    });

    it('rejects an empty physical address', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      await expect(registry.registerProperty('', ONE_ETHER)).to.be.revertedWithCustomError(
        registry,
        'EmptyPhysicalAddress'
      );
    });

    it('rejects a zero price', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      await expect(registry.registerProperty(SAMPLE_ADDRESS, 0)).to.be.revertedWithCustomError(
        registry,
        'ZeroPrice'
      );
    });

    it('rejects a price above the packed uint96 ceiling', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      const tooLarge = UINT96_MAX + 1n;
      await expect(registry.registerProperty(SAMPLE_ADDRESS, tooLarge))
        .to.be.revertedWithCustomError(registry, 'PriceOverflow')
        .withArgs(tooLarge);
    });

    it('accepts a price exactly at the ceiling', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      await registry.registerProperty(SAMPLE_ADDRESS, UINT96_MAX);
      expect((await registry.getProperty(1)).price).to.equal(UINT96_MAX);
    });

    it('does not consume an id when registration reverts', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      await expect(registry.registerProperty('', ONE_ETHER)).to.be.reverted;
      await registry.registerProperty(SAMPLE_ADDRESS, ONE_ETHER);
      expect(await registry.propertyCount()).to.equal(1n);
    });
  });

  describe('registerProperty — input bounds', function () {
    it('accepts an address string exactly at the length cap', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      await registry.registerProperty('a'.repeat(256), ONE_ETHER);
      expect(await registry.propertyCount()).to.equal(1n);
    });

    it('rejects an oversized address string', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);
      await expect(registry.registerProperty('a'.repeat(257), ONE_ETHER))
        .to.be.revertedWithCustomError(registry, 'PhysicalAddressTooLong')
        .withArgs(257n);
    });
  });

  describe('security — a property cannot be claimed twice', function () {
    it('rejects a second registration of the same address', async function () {
      const { registry } = await loadFixture(registryWithPropertyFixture);

      await expect(registry.registerProperty(SAMPLE_ADDRESS, ONE_ETHER))
        .to.be.revertedWithCustomError(registry, 'AddressAlreadyRegistered')
        .withArgs(1n);
    });

    it('stops an attacker from re-registering someone else’s property', async function () {
      const { registry, owner, attacker } = await loadFixture(registryWithPropertyFixture);

      await expect(
        registry.connect(attacker).registerProperty(SAMPLE_ADDRESS, ONE_ETHER * 99n)
      ).to.be.revertedWithCustomError(registry, 'AddressAlreadyRegistered');

      // The original record is completely untouched.
      const property = await registry.getProperty(1);
      expect(property.owner).to.equal(owner.address);
      expect(property.price).to.equal(ONE_ETHER);
      expect(await registry.propertyCount()).to.equal(1n);
    });
  });

  describe('transferOwnership', function () {
    it('moves the property to the new owner', async function () {
      const { registry, buyer, propertyId } = await loadFixture(registryWithPropertyFixture);

      await registry.transferOwnership(propertyId, buyer.address);

      expect(await registry.ownerOf(propertyId)).to.equal(buyer.address);
    });

    it('emits OwnershipTransferred with both parties', async function () {
      const { registry, owner, buyer, propertyId } = await loadFixture(registryWithPropertyFixture);

      const tx = await registry.transferOwnership(propertyId, buyer.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(registry, 'OwnershipTransferred')
        .withArgs(propertyId, owner.address, buyer.address, block.timestamp);
    });

    it('leaves the other fields untouched', async function () {
      const { registry, buyer, propertyId } = await loadFixture(registryWithPropertyFixture);

      const before = await registry.getProperty(propertyId);
      await registry.transferOwnership(propertyId, buyer.address);
      const after = await registry.getProperty(propertyId);

      expect(after.physicalAddress).to.equal(before.physicalAddress);
      expect(after.price).to.equal(before.price);
      expect(after.registeredAt).to.equal(before.registeredAt);
    });

    it('lets the new owner transfer on again', async function () {
      const { registry, buyer, stranger, propertyId } = await loadFixture(
        registryWithPropertyFixture
      );

      await registry.transferOwnership(propertyId, buyer.address);
      await registry.connect(buyer).transferOwnership(propertyId, stranger.address);

      expect(await registry.ownerOf(propertyId)).to.equal(stranger.address);
    });
  });

  describe('security — only the owner can transfer', function () {
    it('reverts when a non-owner tries to transfer', async function () {
      const { registry, attacker, buyer, propertyId } = await loadFixture(
        registryWithPropertyFixture
      );

      await expect(registry.connect(attacker).transferOwnership(propertyId, buyer.address))
        .to.be.revertedWithCustomError(registry, 'NotPropertyOwner')
        .withArgs(propertyId, attacker.address);
    });

    it('stops an attacker seizing a property for themselves', async function () {
      const { registry, owner, attacker, propertyId } = await loadFixture(
        registryWithPropertyFixture
      );

      await expect(
        registry.connect(attacker).transferOwnership(propertyId, attacker.address)
      ).to.be.revertedWithCustomError(registry, 'NotPropertyOwner');

      expect(await registry.ownerOf(propertyId)).to.equal(owner.address);
    });

    it('isolates properties: owning one grants no rights over another', async function () {
      const { registry, owner, attacker } = await loadFixture(registryWithPropertyFixture);

      // The attacker legitimately owns their own property (id 2)...
      await registry.connect(attacker).registerProperty('Attacker House, Lagos', ONE_ETHER);
      expect(await registry.ownerOf(2)).to.equal(attacker.address);

      // ...which gives them no reach over id 1.
      await expect(
        registry.connect(attacker).transferOwnership(1, attacker.address)
      ).to.be.revertedWithCustomError(registry, 'NotPropertyOwner');
      await expect(
        registry.connect(attacker).initiateTransfer(1, attacker.address)
      ).to.be.revertedWithCustomError(registry, 'NotPropertyOwner');
      await expect(
        registry.connect(attacker).cancelTransfer(1)
      ).to.be.revertedWithCustomError(registry, 'NotPropertyOwner');

      expect(await registry.ownerOf(1)).to.equal(owner.address);
    });

    it('revokes the previous owner once the property has moved', async function () {
      const { registry, owner, buyer, stranger, propertyId } = await loadFixture(
        registryWithPropertyFixture
      );

      await registry.transferOwnership(propertyId, buyer.address);

      await expect(registry.connect(owner).transferOwnership(propertyId, stranger.address))
        .to.be.revertedWithCustomError(registry, 'NotPropertyOwner')
        .withArgs(propertyId, owner.address);
    });

    it('rejects the zero address as the new owner', async function () {
      const { registry, propertyId } = await loadFixture(registryWithPropertyFixture);

      await expect(registry.transferOwnership(propertyId, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(registry, 'InvalidNewOwner')
        .withArgs(ethers.ZeroAddress);
    });

    it('rejects the registry itself as the new owner', async function () {
      const { registry, propertyId } = await loadFixture(registryWithPropertyFixture);
      const registryAddress = await registry.getAddress();

      await expect(registry.transferOwnership(propertyId, registryAddress))
        .to.be.revertedWithCustomError(registry, 'InvalidNewOwner')
        .withArgs(registryAddress);
    });

    it('rejects a no-op transfer to the current owner', async function () {
      const { registry, owner, propertyId } = await loadFixture(registryWithPropertyFixture);

      await expect(registry.transferOwnership(propertyId, owner.address))
        .to.be.revertedWithCustomError(registry, 'InvalidNewOwner')
        .withArgs(owner.address);
    });

    it('reverts for a property id that was never registered', async function () {
      const { registry, buyer } = await loadFixture(deployRegistryFixture);

      await expect(registry.transferOwnership(99, buyer.address))
        .to.be.revertedWithCustomError(registry, 'PropertyDoesNotExist')
        .withArgs(99n);
    });
  });

  describe('two-step transfer', function () {
    it('does not move the property until the nominee accepts', async function () {
      const { registry, owner, buyer, propertyId } = await loadFixture(
        registryWithPropertyFixture
      );

      await expect(registry.initiateTransfer(propertyId, buyer.address))
        .to.emit(registry, 'TransferInitiated')
        .withArgs(propertyId, owner.address, buyer.address);

      expect(await registry.ownerOf(propertyId)).to.equal(owner.address);
      expect(await registry.pendingOwnerOf(propertyId)).to.equal(buyer.address);

      await expect(registry.connect(buyer).acceptTransfer(propertyId))
        .to.emit(registry, 'OwnershipTransferred')
        .withArgs(propertyId, owner.address, buyer.address, (t) => t > 0);

      expect(await registry.ownerOf(propertyId)).to.equal(buyer.address);
      expect(await registry.pendingOwnerOf(propertyId)).to.equal(ethers.ZeroAddress);
    });

    it('only the nominee can accept', async function () {
      const { registry, buyer, attacker, propertyId } = await loadFixture(
        registryWithPropertyFixture
      );

      await registry.initiateTransfer(propertyId, buyer.address);

      await expect(registry.connect(attacker).acceptTransfer(propertyId))
        .to.be.revertedWithCustomError(registry, 'NotPendingOwner')
        .withArgs(propertyId, attacker.address);
    });

    it('lets the owner cancel a nomination before it is claimed', async function () {
      const { registry, owner, buyer, propertyId } = await loadFixture(
        registryWithPropertyFixture
      );

      await registry.initiateTransfer(propertyId, buyer.address);
      await expect(registry.cancelTransfer(propertyId))
        .to.emit(registry, 'TransferCancelled')
        .withArgs(propertyId, owner.address);

      await expect(registry.connect(buyer).acceptTransfer(propertyId))
        .to.be.revertedWithCustomError(registry, 'NoPendingTransfer')
        .withArgs(propertyId);

      expect(await registry.ownerOf(propertyId)).to.equal(owner.address);
    });

    it('a nomination cannot be redeemed after a direct transfer has moved the property', async function () {
      const { registry, buyer, stranger, propertyId } = await loadFixture(
        registryWithPropertyFixture
      );

      await registry.initiateTransfer(propertyId, buyer.address);
      // The owner changes their mind and sells to someone else outright.
      await registry.transferOwnership(propertyId, stranger.address);

      expect(await registry.pendingOwnerOf(propertyId)).to.equal(ethers.ZeroAddress);
      await expect(
        registry.connect(buyer).acceptTransfer(propertyId)
      ).to.be.revertedWithCustomError(registry, 'NoPendingTransfer');
      expect(await registry.ownerOf(propertyId)).to.equal(stranger.address);
    });

    it('a later nomination replaces an earlier one', async function () {
      const { registry, buyer, stranger, propertyId } = await loadFixture(
        registryWithPropertyFixture
      );

      await registry.initiateTransfer(propertyId, buyer.address);
      await registry.initiateTransfer(propertyId, stranger.address);

      await expect(
        registry.connect(buyer).acceptTransfer(propertyId)
      ).to.be.revertedWithCustomError(registry, 'NotPendingOwner');

      await registry.connect(stranger).acceptTransfer(propertyId);
      expect(await registry.ownerOf(propertyId)).to.equal(stranger.address);
    });

    it('reverts when there is nothing to accept or cancel', async function () {
      const { registry, buyer, propertyId } = await loadFixture(registryWithPropertyFixture);

      await expect(registry.cancelTransfer(propertyId))
        .to.be.revertedWithCustomError(registry, 'NoPendingTransfer')
        .withArgs(propertyId);
      await expect(registry.connect(buyer).acceptTransfer(propertyId))
        .to.be.revertedWithCustomError(registry, 'NoPendingTransfer')
        .withArgs(propertyId);
    });

    it('rejects an unknown property id on every two-step entry point', async function () {
      const { registry, buyer } = await loadFixture(deployRegistryFixture);

      await expect(registry.initiateTransfer(42, buyer.address)).to.be.revertedWithCustomError(
        registry,
        'PropertyDoesNotExist'
      );
      await expect(registry.acceptTransfer(42)).to.be.revertedWithCustomError(
        registry,
        'PropertyDoesNotExist'
      );
      await expect(registry.cancelTransfer(42)).to.be.revertedWithCustomError(
        registry,
        'PropertyDoesNotExist'
      );
    });
  });

  describe('security — the contract holds no value', function () {
    it('rejects plain POL transfers, so there is nothing to drain', async function () {
      const { registry, attacker } = await loadFixture(deployRegistryFixture);
      const registryAddress = await registry.getAddress();

      // No payable function, no receive(), no fallback().
      await expect(attacker.sendTransaction({ to: registryAddress, value: ONE_ETHER })).to.be
        .reverted;
      expect(await ethers.provider.getBalance(registryAddress)).to.equal(0n);
    });

    it('exposes no function that moves value', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);

      const payable = registry.interface.fragments.filter(
        (fragment) => fragment.type === 'function' && fragment.payable
      );
      expect(payable, 'contract should expose no payable functions').to.have.lengthOf(0);
    });
  });

  describe('getProperty', function () {
    it('is readable by an account with no relationship to the property', async function () {
      const { registry, owner, stranger, propertyId } = await loadFixture(
        registryWithPropertyFixture
      );

      const property = await registry.connect(stranger).getProperty(propertyId);

      expect(property.owner).to.equal(owner.address);
      expect(property.physicalAddress).to.equal(SAMPLE_ADDRESS);
    });

    it('reverts for an unknown id', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);

      await expect(registry.getProperty(1))
        .to.be.revertedWithCustomError(registry, 'PropertyDoesNotExist')
        .withArgs(1n);
    });

    it('reverts for id 0, which is never assigned', async function () {
      const { registry } = await loadFixture(registryWithPropertyFixture);

      await expect(registry.getProperty(0)).to.be.revertedWithCustomError(
        registry,
        'PropertyDoesNotExist'
      );
    });

    it('ownerOf reverts for an unregistered id', async function () {
      const { registry } = await loadFixture(registryWithPropertyFixture);

      await expect(registry.ownerOf(99))
        .to.be.revertedWithCustomError(registry, 'PropertyDoesNotExist')
        .withArgs(99n);
    });
  });

  describe('getProperties pagination', function () {
    async function seededFixture() {
      const ctx = await loadFixture(deployRegistryFixture);
      for (let i = 1; i <= 5; i += 1) {
        await ctx.registry.registerProperty(`Property ${i}`, ONE_ETHER * BigInt(i));
      }
      return ctx;
    }

    it('returns a page from the given offset', async function () {
      const { registry } = await loadFixture(seededFixture);

      const page = await registry.getProperties(2, 2);

      expect(page).to.have.lengthOf(2);
      expect(page[0].physicalAddress).to.equal('Property 2');
      expect(page[1].physicalAddress).to.equal('Property 3');
    });

    it('clamps the page to the number of remaining properties', async function () {
      const { registry } = await loadFixture(seededFixture);

      const page = await registry.getProperties(4, 100);

      expect(page).to.have.lengthOf(2);
      expect(page[1].physicalAddress).to.equal('Property 5');
    });

    it('returns an empty page for out-of-range input', async function () {
      const { registry } = await loadFixture(seededFixture);

      expect(await registry.getProperties(0, 10)).to.have.lengthOf(0);
      expect(await registry.getProperties(6, 10)).to.have.lengthOf(0);
      expect(await registry.getProperties(1, 0)).to.have.lengthOf(0);
    });

    it('never returns more than MAX_PAGE_SIZE, however large the limit', async function () {
      const { registry } = await loadFixture(deployRegistryFixture);

      // 101 properties, so the cap binds before the "remaining" clamp does.
      for (let i = 1; i <= 101; i += 1) {
        await registry.registerProperty(`Capped Property ${i}`, ONE_ETHER);
      }

      expect(await registry.getProperties(1, 1_000_000)).to.have.lengthOf(100);
      expect(await registry.getProperties(2, 1_000_000)).to.have.lengthOf(100);
      // From id 51 only 51 remain, so the smaller clamp wins.
      expect(await registry.getProperties(51, 1_000_000)).to.have.lengthOf(51);
    });
  });
});
