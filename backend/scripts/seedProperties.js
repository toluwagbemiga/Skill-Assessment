/**
 * Seeds a handful of demo properties so the frontend has something to render.
 *
 *   node scripts/seedProperties.js          # insert if the collection is empty
 *   node scripts/seedProperties.js --force  # wipe demo entries and re-insert
 *
 * Only touches documents tagged with the demo marker below, so it will never
 * delete real listings.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Property from '../models/propertyModel.js';

const DEMO_MARKER = '[demo]';

const image = (id) => [`https://images.unsplash.com/photo-${id}?w=1600&q=80&auto=format&fit=crop`];

const properties = [
  {
    title: '3-Bedroom Duplex with BQ',
    location: '12 Admiralty Way, Lekki Phase 1, Lagos',
    price: 250000,
    image: image('1568605114967-8130f3a36994'),
    beds: 3,
    baths: 4,
    sqm: 280,
    type: 'Duplex',
    availability: 'available',
    description: `A bright, modern three-bedroom duplex on a quiet stretch of Admiralty Way. Open-plan living and dining, fitted kitchen with island, and a self-contained boys' quarters. Fully serviced estate with 24-hour power and security. ${DEMO_MARKER}`,
    amenities: ['24/7 Power', 'Borehole Water', 'Security', 'Parking', 'Fitted Kitchen', 'Balcony'],
    phone: '+234 801 234 5678',
  },
  {
    title: '4-Bedroom Terrace House',
    location: 'Chevron Drive, Lekki, Lagos',
    price: 420000,
    image: image('1580587771525-78b9dba3b914'),
    beds: 4,
    baths: 5,
    sqm: 340,
    type: 'Terrace',
    availability: 'available',
    description: `Spacious four-bedroom terrace in a gated development off Chevron Drive. All rooms en-suite, generous living area, private garden and a rooftop terrace. Walking distance to schools and shopping. ${DEMO_MARKER}`,
    amenities: ['Gated Estate', 'Swimming Pool', 'Gym', 'Security', 'Parking', 'Garden'],
    phone: '+234 802 345 6789',
  },
  {
    title: '2-Bedroom Serviced Apartment',
    location: 'Victoria Island, Lagos',
    price: 180000,
    image: image('1502672260266-1c1ef2d93688'),
    beds: 2,
    baths: 2,
    sqm: 145,
    type: 'Apartment',
    availability: 'available',
    description: `Fully serviced two-bedroom apartment in the heart of Victoria Island. Floor-to-ceiling windows, central air conditioning, and access to a shared pool and gym. Service charge covers power, water and cleaning. ${DEMO_MARKER}`,
    amenities: ['24/7 Power', 'Swimming Pool', 'Gym', 'Elevator', 'Security', 'Air Conditioning'],
    phone: '+234 803 456 7890',
  },
  {
    title: '5-Bedroom Detached Villa',
    location: 'Banana Island, Ikoyi, Lagos',
    price: 1850000,
    image: image('1613490493576-7fde63acd811'),
    beds: 5,
    baths: 6,
    sqm: 620,
    type: 'Villa',
    availability: 'available',
    description: `Detached five-bedroom villa on Banana Island, set on landscaped grounds with a private pool. Double-volume reception, cinema room, staff quarters and parking for six cars. ${DEMO_MARKER}`,
    amenities: ['Private Pool', 'Cinema Room', 'Staff Quarters', 'Security', 'Garden', 'Parking'],
    phone: '+234 804 567 8901',
  },
];

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set in backend/.env');

  await mongoose.connect(uri);
  console.log(`Connected to ${mongoose.connection.host}/${mongoose.connection.name}`);

  const force = process.argv.includes('--force');
  const existing = await Property.countDocuments({ description: new RegExp(escapeRegex(DEMO_MARKER)) });

  if (existing > 0 && !force) {
    console.log(`${existing} demo properties already present. Re-run with --force to replace them.`);
    await printAll();
    return mongoose.disconnect();
  }

  if (force && existing > 0) {
    const { deletedCount } = await Property.deleteMany({
      description: new RegExp(escapeRegex(DEMO_MARKER)),
    });
    console.log(`Removed ${deletedCount} existing demo properties.`);
  }

  const created = await Property.insertMany(
    properties.map((p) => ({ ...p, status: 'active', postedBy: null, expiresAt: null }))
  );
  console.log(`Inserted ${created.length} properties.\n`);

  await printAll();
  await mongoose.disconnect();
}

async function printAll() {
  const all = await Property.find({}, '_id title location price').sort({ createdAt: 1 }).lean();
  console.log('Property detail URLs:');
  for (const p of all) {
    console.log(`  http://localhost:5173/property/${p._id}   ${p.title} — ${p.location}`);
  }
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
