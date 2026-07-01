import 'dotenv/config';
import * as ftp from "basic-ftp";

// Credenciales y destino se leen del .env (NO se commitean).
// Requeridas: FTP_HOST, FTP_USER, FTP_PASSWORD. Opcional: FTP_REMOTE_DIR.
const { FTP_HOST, FTP_USER, FTP_PASSWORD } = process.env;
const REMOTE_DIR = process.env.FTP_REMOTE_DIR || "public_html/app_cuaderno";

async function deploy() {
    if (!FTP_HOST || !FTP_USER || !FTP_PASSWORD) {
        console.error("❌ Faltan credenciales FTP en .env (FTP_HOST, FTP_USER, FTP_PASSWORD).");
        process.exit(1);
    }

    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        console.log("Connecting to FTP...");
        await client.access({
            host: FTP_HOST,
            user: FTP_USER,
            password: FTP_PASSWORD,
            secure: false
        });
        console.log(`Connected! Uploading dist/ to ${REMOTE_DIR}/ ...`);
        await client.ensureDir(REMOTE_DIR);
        await client.clearWorkingDir();
        await client.uploadFromDir("dist");
        console.log("Upload completed successfully.");
    }
    catch (err) {
        console.error("FTP Error:", err);
        process.exitCode = 1;
    }
    client.close();
}

deploy();
