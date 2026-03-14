import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from '../config/database.js';
import { bookService } from '../services/bookService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seedBooks() {
  try {
    console.log('🌱 Starting book seeding process...\n');

    // Connect to database
    await connectDB();

    // Read books.json
    const booksPath = path.join(__dirname, '../../data/books.json');
    const booksData = JSON.parse(fs.readFileSync(booksPath, 'utf-8'));

    console.log(`📚 Found ${booksData.length} books to import\n`);

    let successCount = 0;
    let errorCount = 0;

    // Import books one by one
    for (const bookData of booksData) {
      try {
        await bookService.createBook(bookData);
        successCount++;
        console.log(`✅ Imported: ${bookData.title} by ${bookData.author}`);
      } catch (error) {
        errorCount++;
        console.error(`❌ Failed to import ${bookData.title}:`, error.message);
      }
    }

    console.log(`\n📊 Import Summary:`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${errorCount}`);
    console.log(`   Total: ${booksData.length}`);
    console.log(`\n✨ Seeding complete!`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedBooks();
