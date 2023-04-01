To install SSH if its not yet installed run the following:

- `sudo apt-get update` ( update existing repos )
- `sudo apt-get install net-tools` ( install ifconfig )
- `ifconfig ( check server ip )`
- `sudo apt install ssh -y`
- `sudo systemctl enable --now ssh`
- `sudo ufw allow ssh`
  - or `sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp`
- `sudo ufw enable`