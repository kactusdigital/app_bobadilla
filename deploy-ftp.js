import * as ftp from "basic-ftp";

async function deploy() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        console.log("Connecting to FTP...");
        await client.access({
            host: "195.250.23.30",
            user: "belen",
            password: "pexxep-kotrop-Cawby3",
            secure: false
        });
        console.log("Connected! Uploading dist/ to public_html/app_cuaderno/...");
        await client.ensureDir("public_html/app_cuaderno");
        await client.clearWorkingDir();
        await client.uploadFromDir("dist");
        console.log("Upload completed successfully.");
    }
    catch(err) {
        console.error("FTP Error:", err);
    }
    client.close();
}

deploy();
