
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { walk } from "https://deno.land/std@0.168.0/fs/walk.ts";
import { join, dirname, fromFileUrl } from "https://deno.land/std@0.168.0/path/mod.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_KEY env vars.");
    Deno.exit(1);
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
            const filePath = join(DOCS_DIR, file);
            const fileData = await Deno.readFile(filePath);
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
