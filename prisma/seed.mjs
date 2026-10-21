// Seeds the Car inventory with sample vehicles.
// Run with:  npm run db:seed
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const prisma = new PrismaClient();

// Mirror src/lib/auth.ts hashing so seeded dealers can log in.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

/** @type {Array<import('@prisma/client').Prisma.CarCreateManyInput>} */
const CARS = [
  {
    make: "Toyota",
    model: "Corolla",
    year: 2021,
    price: 18500,
    mileage: 28000,
    bodyType: "sedan",
    fuelType: "petrol",
    transmission: "automatic",
    color: "Silver",
    seats: 5,
    description: "Reliable and fuel-efficient compact sedan, perfect for daily commuting and first-time buyers.",
  },
  {
    make: "Honda",
    model: "Civic",
    year: 2020,
    price: 19900,
    mileage: 34000,
    bodyType: "sedan",
    fuelType: "petrol",
    transmission: "automatic",
    color: "Black",
    seats: 5,
    description: "Sporty and economical sedan with great handling and a refined interior.",
  },
  {
    make: "Toyota",
    model: "RAV4",
    year: 2022,
    price: 31500,
    mileage: 19000,
    bodyType: "suv",
    fuelType: "hybrid",
    transmission: "automatic",
    color: "White",
    seats: 5,
    description: "Spacious hybrid SUV with excellent fuel economy, ideal for families and road trips.",
  },
  {
    make: "Tesla",
    model: "Model 3",
    year: 2023,
    price: 39900,
    mileage: 12000,
    bodyType: "sedan",
    fuelType: "electric",
    transmission: "automatic",
    color: "Blue",
    seats: 5,
    description: "Long-range electric sedan with autopilot, fast charging and a minimalist tech-forward cabin.",
  },
  {
    make: "Ford",
    model: "F-150",
    year: 2021,
    price: 42000,
    mileage: 41000,
    bodyType: "truck",
    fuelType: "petrol",
    transmission: "automatic",
    color: "Red",
    seats: 5,
    description: "Powerful full-size pickup truck with high towing capacity for work and adventure.",
  },
  {
    make: "BMW",
    model: "3 Series",
    year: 2020,
    price: 33500,
    mileage: 30000,
    bodyType: "sedan",
    fuelType: "petrol",
    transmission: "automatic",
    color: "Grey",
    seats: 5,
    description: "Luxury sports sedan combining performance, premium materials and advanced driver assistance.",
  },
  {
    make: "Mercedes-Benz",
    model: "GLC",
    year: 2022,
    price: 47500,
    mileage: 16000,
    bodyType: "suv",
    fuelType: "diesel",
    transmission: "automatic",
    color: "Black",
    seats: 5,
    description: "Premium midsize SUV with a quiet diesel engine, plush ride and elegant styling.",
  },
  {
    make: "Hyundai",
    model: "Tucson",
    year: 2021,
    price: 24900,
    mileage: 26000,
    bodyType: "suv",
    fuelType: "petrol",
    transmission: "automatic",
    color: "Green",
    seats: 5,
    description: "Value-packed family SUV with a long warranty, modern tech and comfortable seating.",
  },
  {
    make: "Volkswagen",
    model: "Golf",
    year: 2019,
    price: 16500,
    mileage: 45000,
    bodyType: "hatchback",
    fuelType: "petrol",
    transmission: "manual",
    color: "White",
    seats: 5,
    description: "Fun-to-drive practical hatchback with a solid build and nimble city handling.",
  },
  {
    make: "Nissan",
    model: "Leaf",
    year: 2020,
    price: 17900,
    mileage: 31000,
    bodyType: "hatchback",
    fuelType: "electric",
    transmission: "automatic",
    color: "Silver",
    seats: 5,
    description: "Affordable electric hatchback, quiet and cheap to run, great for urban driving.",
  },
  {
    make: "Kia",
    model: "Sportage",
    year: 2023,
    price: 27900,
    mileage: 9000,
    bodyType: "suv",
    fuelType: "hybrid",
    transmission: "automatic",
    color: "Blue",
    seats: 5,
    description: "Stylish near-new hybrid SUV with bold design and a generous list of standard features.",
  },
  {
    make: "Mazda",
    model: "MX-5",
    year: 2021,
    price: 28500,
    mileage: 14000,
    bodyType: "convertible",
    fuelType: "petrol",
    transmission: "manual",
    color: "Red",
    seats: 2,
    description: "Iconic lightweight roadster delivering pure driving joy with the top down.",
  },
  {
    make: "Audi",
    model: "A4",
    year: 2020,
    price: 31900,
    mileage: 27000,
    bodyType: "sedan",
    fuelType: "diesel",
    transmission: "automatic",
    color: "Grey",
    seats: 5,
    description: "Refined executive sedan with quattro grip, frugal diesel engine and a high-quality cabin.",
  },
  {
    make: "Jeep",
    model: "Wrangler",
    year: 2022,
    price: 38900,
    mileage: 21000,
    bodyType: "suv",
    fuelType: "petrol",
    transmission: "automatic",
    color: "Green",
    seats: 5,
    description: "Rugged off-road SUV with removable roof and legendary all-terrain capability.",
  },
  {
    make: "Honda",
    model: "Odyssey",
    year: 2019,
    price: 23500,
    mileage: 52000,
    bodyType: "van",
    fuelType: "petrol",
    transmission: "automatic",
    color: "Silver",
    seats: 7,
    description: "Roomy seven-seat minivan with flexible seating, ideal for large families.",
  },
  {
    make: "Toyota",
    model: "Camry",
    year: 2022,
    price: 26900,
    mileage: 18000,
    bodyType: "sedan",
    fuelType: "hybrid",
    transmission: "automatic",
    color: "White",
    seats: 5,
    description: "Comfortable midsize hybrid sedan with strong reliability and low running costs.",
  },
];

// Demo dealers for the Dealer Core auction portal.
const DEALERS = [
  { name: "Premier Auto Group", email: "dealer@wheelerdealers.test", password: "dealer1234" },
  { name: "City Motors", email: "city@wheelerdealers.test", password: "dealer1234" },
];

// Sample seller leads (cars being sold) that become auctions for dealers.
const SELLER_LEADS = [
  {
    intent: "sell",
    make: "Toyota",
    model: "Corolla",
    year: 2018,
    mileage: 62000,
    condition: "good",
    name: "Sarah Johnson",
    mobile: "+1 555 0101",
    email: "sarah@example.com",
    estimateMin: 11000,
    estimateMax: 13500,
  },
  {
    intent: "trade",
    make: "Ford",
    model: "Focus",
    year: 2016,
    mileage: 88000,
    condition: "fair",
    name: "Mike Chen",
    mobile: "+1 555 0102",
    email: "mike@example.com",
    estimateMin: 7000,
    estimateMax: 8800,
  },
  {
    intent: "sell",
    make: "BMW",
    model: "320i",
    year: 2019,
    mileage: 41000,
    condition: "excellent",
    name: "Aisha Khan",
    mobile: "+1 555 0103",
    email: "aisha@example.com",
    estimateMin: 22000,
    estimateMax: 25000,
  },
];

async function main() {
  // Safety: never wipe/seed a production database with demo data.
  if (process.env.NODE_ENV === "production") {
    console.error(
      "Refusing to run the demo seed in production (NODE_ENV=production). " +
        "This script deletes and replaces data. Aborting.",
    );
    process.exit(1);
  }

  const currency = process.env.NEXT_PUBLIC_CURRENCY || "USD";

  // Inventory
  await prisma.car.deleteMany();
  await prisma.car.createMany({ data: CARS });
  const carCount = await prisma.car.count();
  console.log(`Seeded ${carCount} cars into the inventory.`);

  // Dealers (clearing bids/auctions/leads first to keep the demo data consistent)
  await prisma.bid.deleteMany();
  await prisma.auction.deleteMany();
  await prisma.dealer.deleteMany();
  for (const d of DEALERS) {
    await prisma.dealer.create({
      data: {
        name: d.name,
        email: d.email,
        passwordHash: hashPassword(d.password),
        approved: true,
      },
    });
  }
  console.log(`Seeded ${DEALERS.length} demo dealers.`);

  // Seller leads + open auctions
  await prisma.lead.deleteMany({ where: { intent: { in: ["sell", "trade"] } } });
  const endsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  for (const lead of SELLER_LEADS) {
    const created = await prisma.lead.create({ data: { ...lead, currency } });
    await prisma.auction.create({
      data: { leadId: created.id, status: "open", endsAt },
    });
  }
  console.log(`Seeded ${SELLER_LEADS.length} open auctions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
