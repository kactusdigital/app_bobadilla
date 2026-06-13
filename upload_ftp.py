import ftplib
import os

server = '195.250.23.30'
user = 'belen'
password = 'pexxep-kotrop-Cawby3'
remote_dir = '/public_html/app_cuaderno'
local_dir = 'dist'

ftp = ftplib.FTP(server)
ftp.login(user, password)
ftp.cwd(remote_dir)

def upload_dir(local_path, remote_path):
    for name in os.listdir(local_path):
        local_item = os.path.join(local_path, name)
        remote_item = f"{remote_path}/{name}"
        if os.path.isfile(local_item):
            print(f"Uploading {local_item} to {remote_item}")
            with open(local_item, 'rb') as f:
                ftp.storbinary(f"STOR {name}", f)
        elif os.path.isdir(local_item):
            print(f"Creating directory {remote_item}")
            try:
                ftp.mkd(name)
            except ftplib.error_perm as e:
                if not e.args[0].startswith('550'):
                    raise
            print(f"Entering directory {remote_item}")
            ftp.cwd(name)
            upload_dir(local_item, remote_item)
            ftp.cwd('..')

upload_dir(local_dir, remote_dir)
ftp.quit()
print("Upload complete!")
