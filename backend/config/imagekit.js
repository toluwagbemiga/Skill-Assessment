import ImageKit from 'imagekit';
import dotenv from 'dotenv';

dotenv.config({ path: './.env.local' });
dotenv.config();

/**
 * ImageKit is only used to upload property images. It is an optional integration:
 * a local or CI environment without credentials should still be able to run the
 * API, browse listings and use every other feature.
 *
 * Previously this module constructed the client at import time, and the ImageKit
 * constructor throws when publicKey is empty. Because two controllers import this
 * file, that turned a missing optional credential into a crash on boot — the whole
 * API refused to start.
 *
 * Now an unconfigured environment gets a stub that throws only if something
 * actually tries to upload, so the failure is scoped to the feature that needs it.
 */

const CREDENTIALS = {
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
};

const missing = Object.entries(CREDENTIALS)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const isImageKitConfigured = missing.length === 0;

function createUnconfiguredStub() {
  const fail = async () => {
    throw new Error(
      `ImageKit is not configured (missing: ${missing.join(', ')}). ` +
        'Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT to enable image uploads.'
    );
  };

  return { upload: fail, deleteFile: fail, listFiles: fail };
}

let imagekit;

if (isImageKitConfigured) {
  imagekit = new ImageKit(CREDENTIALS);
  console.log('ImageKit connected successfully!');
} else {
  console.warn(
    `⚠️  ImageKit not configured (missing: ${missing.join(', ')}). ` +
      'Image uploads are disabled; everything else works normally.'
  );
  imagekit = createUnconfiguredStub();
}

export default imagekit;
