
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_KEY env vars.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = 'materials';
const DOCS_DIR = 'd:\\SP House\\Docie';

async function uploadFiles() {
    console.log(`Checking bucket '${BUCKET}'...`);
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.find(b => b.name === BUCKET);

    if (!bucketExists) {
        console.log(`Creating bucket '${BUCKET}'...`);
        const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
        if (error) {
            console.error("Error creating bucket:", error);
            return;
        }
    } else {
        console.log(`Bucket '${BUCKET}' exists.`);
    }

    const files = [
        "SP HAUS ESPAÇO PARA EVENTOS  2026.pdf",
        "spHaus  manual de uso do espaço.pdf"
    ];

    console.log("Uploading files...");
    const uploadedLinks = [];

    for (const file of files) {
        try {
            const filePath = path.join(DOCS_DIR, file);
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                console.error(`File not found: ${filePath}`);
                continue;
            }

            const fileData = fs.readFileSync(filePath);
            const cleanName = file.replace(/\s+/g, '_').toLowerCase(); // Normalize name

            console.log(`Uploading ${file} as ${cleanName}...`);
            const { data, error } = await supabase.storage
                .from(BUCKET)
                .upload(cleanName, fileData, {
                    contentType: 'application/pdf',
                    upsert: true
                });

            if (error) {
                console.error(`Failed to upload ${file}:`, error);
            } else {
                const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(cleanName);
                console.log(`SUCCESS: ${publicUrlData.publicUrl}`);
                uploadedLinks.push({ name: file, url: publicUrlData.publicUrl });
            }
        } catch (e) {
            console.error(`Error processing ${file}:`, e.message);
        }
    }

    console.log("\n--- PUBLIC LINKS ---");
    console.log(JSON.stringify(uploadedLinks, null, 2));
}

uploadFiles();
