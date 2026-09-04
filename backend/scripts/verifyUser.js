/**
 * Marks a user's email as verified without sending a verification email.
 *
 * Local development only — registration emails go through Brevo, and a local
 * setup usually has no API key, so signups would otherwise be stuck at the
 * "please verify your email" gate with no way through.
 *
 *   node scripts/verifyUser.js someone@example.com
 *   node scripts/verifyUser.js --all
 *   node scripts/verifyUser.js --list
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/userModel.js';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/verifyUser.js <email> | --all | --list');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGO_URI);

  if (arg === '--list') {
    const users = await User.find({}, 'email name isEmailVerified createdAt').sort({ createdAt: 1 }).lean();
    if (users.length === 0) {
      console.log('No users registered yet.');
    } else {
      console.log(`${users.length} user(s):`);
      for (const u of users) {
        console.log(`  ${u.isEmailVerified ? '[verified]  ' : '[unverified]'} ${u.email}  (${u.name})`);
      }
    }
    return mongoose.disconnect();
  }

  const filter = arg === '--all' ? { isEmailVerified: { $ne: true } } : { email: arg.toLowerCase() };

  const result = await User.updateMany(filter, {
    $set: { isEmailVerified: true },
    $unset: { emailVerificationToken: '', verificationTokenExpiry: '' },
  });

  if (result.matchedCount === 0) {
    console.log(arg === '--all' ? 'No unverified users found.' : `No user found with email ${arg}`);
  } else {
    console.log(`Verified ${result.modifiedCount} user(s). They can now log in.`);
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
