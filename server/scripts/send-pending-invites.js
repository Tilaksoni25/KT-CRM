#!/usr/bin/env node
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');
const { sendInviteEmail } = require('../src/services/email.service');
const crypto = require('crypto');
const { hashSha256 } = require('../src/utils/hash');
const env = require('../src/config/env');

(async () => {
  try {
    await connectDB();

    // Find users with at least one companyAccess entry that has invitedAt set
    // but inviteSent false or missing.
    const users = await User.find({
      companyAccess: {
        $elemMatch: {
          invitedAt: { $exists: true },
          $or: [ { inviteSent: false }, { inviteSent: { $exists: false } } ]
        }
      }
    });

    console.log(`Found ${users.length} users with pending invites`);

    for (const user of users) {
      // iterate companyAccess entries
      for (let i = 0; i < user.companyAccess.length; i++) {
        const entry = user.companyAccess[i];
        if (!entry.invitedAt) continue;
        if (entry.inviteSent) continue;

        // Generate a 48-hour invite token and save hashed token on user
        const plainToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashSha256(plainToken);
        const tokenExpiry = new Date(Date.now() + (48 * 60 * 60 * 1000));

        // Persist token fields at user-level so reset flow works
        user.passwordResetTokenHash = tokenHash;
        user.passwordResetExpires = tokenExpiry;

        // Attempt to send invite email
        try {
          await sendInviteEmail(user.email, plainToken, env.CLIENT_URL || 'Your Company');

          // mark inviteSent true for this companyAccess entry
          user.companyAccess[i].inviteSent = true;

          await user.save();
          console.log(`Invite sent to ${user.email} for company ${entry.companyId}`);
        } catch (err) {
          console.error(`Failed to send invite to ${user.email}:`, err.message || err);
          // Do not mark inviteSent so it can be retried later
        }
      }
    }

    await disconnectDB();
    process.exit(0);
  } catch (err) {
    console.error('Error processing pending invites:', err);
    try { await disconnectDB(); } catch (e) {}
    process.exit(1);
  }
})();
