# TL;DR version of the ubuntu router instalation

#### Usefull stuff:
list NICs and their IPs:
```
ifconfig -a | awk '/^[a-z]/ { if (ifname) print ifname, ip; ifname=$1; ip="N/A" } /inet / { ip=$2 } END { print ifname, ip }'
```
List NICs and their MAC addresses:
```
ifconfig -a | awk '/^[a-z]/ {ifname=$1} /ether / {print ifname, ip, $2}'
```

### Static IP setup
- list netplan files: `ls /etc/netplan`
- edit netplan file `sudo nano /etc/netplan/01-network-manager-all.yaml`
- netplan config [sample](./2-nics-sample-config.yaml.yml)
- restart server

### DHCP server setup
- `sudo apt-get update` - update server libs and repos
- `sudo apt install isc-dhcp-server -y` - install the DHCP server
- `sudo systemctl start isc-dhcp-server` - start the server
- `sudo systemctl enable isc-dhcp-server` - enable the DHCP server to run on boot

edit edit dhcp server config - `sudo nano /etc/default/isc-dhcp-server`
change:
```
DHCPDv4_CONF=/etc/dhcp/dhcpd.conf
DHCPDv4_PID=/var/run/dhcpd.pid
INTERFACESv4="[Your Internal Ethernet interface name here]"
```

edit hosts - `sudo nano /etc/hosts`\
Add `10.0.0.1 cluster`

ifconfig with mac address: \
`ifconfig -a | awk '/^[a-z]/ {ifname=$1} /ether / {print ifname, ip, $2}'`

edit dhcp resolving config: \
`sudo nano /etc/dhcp/dhcpd.conf`

Set to:
```bash
# dhcpd.conf
#option domain-name "example.org";
#option domain-name-servers ns1.example.org, ns2.example.org;

default-lease-time 600;
max-lease-time 7200;
ddns-update-style none;
authoritative;
log-facility local7;

# No service will be given on this subnet
subnet 192.168.1.0 netmask 255.255.255.0 {
}

# The internal cluster network
group {
   option broadcast-address 10.0.0.255;           #network range of cluster network: 10.0.0.0 - 10.0.0.255
   option routers 10.0.0.1;                       #this router IP ( gateway for cluster network )
   default-lease-time 600;
   max-lease-time 7200;
   option domain-name "cluster";
   option domain-name-servers 8.8.8.8, 8.8.4.4;   #google dns servers
   subnet 10.0.0.0 netmask 255.255.255.0 {        #settings applied to 10.0.0.0 - 10.0.0.255 ips
      range 10.0.0.2 10.0.0.255;                  #assign IP range of 10.0.0.2-10.0.0.255 ( inclusive )
      # Head Node
      host cluster {
         hardware ethernet 71-5F-E3-4F-05-44;    #Dont forget to change with mac of your internal connection
         fixed-address 10.0.0.1;
      }
   }
}
```
Restart dhcp server - `sudo systemctl restart isc-dhcp-server`\
Check active IPs - `dhcp-lease-list`

Fix nameservers if broken:
- Edit resolver - `sudo nano /etc/resolv.conf`
- Chanre nameserver to `nameserver 8.8.8.8`

### Setup IP forwarding

Enable forwarding in system: \
Edit `sudo nano /etc/sysctl.conf` \
```bash
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=1
```
Apply - `sudo sysctl -p`

Allow forwarding in UFW:\
Edit `sudo nano /etc/default/ufw`\
Set `DEFAULT_FORWARD_POLICY="ACCEPT"`

Configure UFW before rules:\
Edit `sudo nano /etc/ufw/before.rules`\
Add before `*filter`.
```bash
*nat
:POSTROUTING ACCEPT [0:0]
-A POSTROUTING -o [Home Network Interface Placeholder] -j MASQUERADE
COMMIT
```

Configure UFW rules:\
- `sudo ufw allow in on [Cluster Facing NIC]`
- `sudo ufw allow out on [Home network NIC]`
- `sudo ufw route deny in on enp1s0 out on [Home network NIC] to 192.168.1.0/24 proto`
- `sudo ufw route deny in on [Cluster Facing NIC] out on [Home network NIC] to 2a0d:6fc2:19f8::/64`

block pings to home network as well\
Edit `sudo nano /etc/ufw/before.rules`\
Add this above the `#ok icmp code for FORWARD` line we did for IP forwarding
```bash
# deny icmp code for FORWARD
-A ufw-before-forward -p icmp --icmp-type destination-unreachable -i enp1s0 -d 192.168.1.0/24 -j DROP
-A ufw-before-forward -p icmp --icmp-type time-exceeded -i enp1s0 -d 192.168.1.0/24 -j DROP
-A ufw-before-forward -p icmp --icmp-type parameter-problem -i enp1s0 -d 192.168.1.0/24 -j DROP
-A ufw-before-forward -p icmp --icmp-type echo-request -i enp1s0 -d 192.168.1.0/24 -j DROP
```

Restart UFW - `sudo systemctl restart ufw` \
**restart the server (reloading and resetting didn't work for me)**`sudo reboot`\
Verify - `sudo ufw status verbose`

### Setup HaProxy Load Balancer

- Optional: `sudo add-apt-repository ppa:vbernat/haproxy-1.7`
- `sudo apt-get update` - update server libs and repos
- `sudo apt install haproxy -y` - install HAProxy service
- `sudo systemctl start haproxy` - start HAProxy
- `sudo systemctl enable haproxy` - enable HAProxy to run on boot

Allow http:\
`sudo ufw allow http`\
OR\
`sudo ufw allow in on [Home Network Interface Name] to any port 80`

Edit config - `sudo nano /etc/haproxy/haproxy.cfg`
Add at end of file:
```bash
```bash
frontend http-in
  bind *:80                     #listen to port 80
  #bind 192.168.1.200:80        #listen to port 80 only in out facing IP address ( home network )
  default_backend servers       #"servers" is a name, you can call it anyway you like

backend servers
  mode http
  balance roundrobin                        #balance type: round-robin 
  option redispatch                         #when retrying send to anotehr server instead of sticking to the same one
  retry-on conn-failure empty-response 503  #in case of failure retry on another server
  
  #next line defines the server, check every 1000ms that the server is up
  #2 successful checks meaning the server is up
  #1 failed check will mark the server as down
  server server1 10.0.0.10:80 check inter 1000 rise 2 fall 1
  #server server1 10.0.0.11:80 check inter 1000 rise 2 fall 1
  #server server1 10.0.0.12:80 check inter 1000 rise 2 fall 1
  #server server1 10.0.0.13:80 check inter 1000 rise 2 fall 1
```

Restart HaProxy - `sudo systemctl restart haproxy` \
Restart Server - `sudo reboot`

Now all you need are some backend servers or a Kubernetes cluster :)
Happy coding!

### Sources
Used in this tutorial:
- ChatGPT4 - general help
    - https://chat.openai.com/chat/
- Networking setup, dhcp:
    - https://www.raspberrypi.com/tutorials/cluster-raspberry-pi-tutorial/
- dhcp additional:
    - https://www.linuxtechi.com/how-to-configure-dhcp-server-on-ubuntu/
- Netplan static IPs:
    - https://linuxconfig.org/how-to-configure-static-ip-address-on-ubuntu-18-04-bionic-beaver-linux
- IP forwarding:
    - https://linuxconfig.org/how-to-turn-on-off-ip-forwarding-in-linux
- HAproxy setup:
    - https://www.haproxy.com/blog/haproxy-configuration-basics-load-balance-your-servers/

For use in older linux distros:
- static IP setup:
    - https://www.cyberciti.biz/faq/add-configure-set-up-static-ip-address-on-debianlinux/
    - https://linuxconfig.org/how-to-switch-back-networking-to-etc-network-interfaces-on-ubuntu-22-04-jammy-jellyfish-linux



