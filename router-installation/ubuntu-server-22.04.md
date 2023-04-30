# Configuring ubuntu server as a router

### What do you need:
- [TL;DR version can be found here.](./ubuntu-server-22.04.tl-dr.md) 
- **Ubuntu Server 22.04** installed (obviously).
- **2 Network interfaces**
  - A single network subnet cannot provide the same level of security.
  - You can add an Ethernet USB adapter or use a server with multiple Ethernet ports.
- **SSH access** to the server.
  - SSH installation guide [here](./ubuntu-ssh-install.md).
  - It's a good practice to use RSA keys instead of passwords.
  - Consider installing the `fail2ban` service to prevent brute force attacks.
    - https://www.digitalocean.com/community/tutorials/how-to-protect-ssh-with-fail2ban-on-ubuntu-22-04
- **ifconfig**
  - For checking the network interface names and statuses.
  - To install, simply run:
    - `sudo apt update`
    - `sudo apt install net-tools -y`
- **Ubuntu ufw** (Uncomplicated Firewall)
  - I am using ufw instead of iptables (iptables is an older Ubuntu firewall).
- **isc-dhcp-server**
  - The DHCP server will handle internal IP assignment.
- **HAProxy** - High Availability Proxy
  - Will be used as a Load Balancer and allow fine control of incoming traffic.
    - If you don't want to use the router as a load balancer, you can always forward traffic to a specific server using Nginx or HAProxy.

## Setting up the network (one way forwarding)
First and foremost, you need to ensure that both Ethernet interfaces have a static IP address.
Although you don't have to set up the outward-facing (in your home network) Ethernet to be static,
it is helpful when configuring the load balancer and controlling traffic from the internet or your home devices.

**NOTE:** *You should have a way to physically access your server,
as changing networks can go wrong, and you may not be able to access it via SSH if the server has no network connectivity.*

After connecting to your server via SSH, determine the name of each Ethernet interface by finding the names of your network interfaces.

Use ifconfig and run the following command:\
```
ifconfig -a | awk '/^[a-z]/ { if (ifname) print ifname, ip; ifname=$1; ip="N/A" } /inet / { ip=$2 } END { print ifname, ip }'
```
You should get something like:
```bash
enp1s0: N/A
enx1c61b46ce491: 192.168.1.69
lo: 127.0.0.1
```

In the above example, `enp1s0` is the server's internal Ethernet that is not connected to anything,
and `enx1c61b46ce491` is the USB-to-Ethernet adapter that is connected to the home network.

NOTE: *It's important to verify that all the network interfaces are detected :)*


## Configure your network to have static IPs**

- List the network config YAML files:
  `ls /etc/netplan`
  You should see a list of YAML files you can edit. In my case, I have [01-network-manager-all.yaml](./2-nics-sample-config.yaml.yml).

- Copy the file `2-nics-sample-config.yaml.yml` and edit it with your server configurations.

- Copy the edited contents and, on the server, run:
  `sudo nano /etc/netplan/01-network-manager-all.yaml`
  Paste the edited contents, save, and exit.

- Run `sudo cat /etc/netplan/01-network-manager-all.yaml` to verify. You should see the settings you just saved.

Example **01-network-manager-all.yaml** file:

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    enx1c61b46ce491:
      dhcp4: false
      dhcp6: false
      addresses:
        - 192.168.1.200/24             #Home network static IP
      routes:
        - to: default
          via: 192.168.1.1             #Home network Gateway IP
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
    enp1s0:
      dhcp4: false
      dhcp6: false
      addresses:
        - 10.0.0.1/24                  #Cluster network static IP
      nameservers:
        addresses: [8.8.8.8, 8.8.4.4]
```

Reboot the server with `sudo reboot`. \
**NOTE:** *If you made a mistake in the config, your network may be down, so have backup access to the server!*

After reboot, connect to the new static IP you assigned. (In the example case its 192.168.1.200) \
Verify the interfaces and IPs using:
```
ifconfig -a | awk '/^[a-z]/ { if (ifname) print ifname, ip; ifname=$1; ip="N/A" } /inet / { ip=$2 } END { print ifname, ip }'
```
If you have the switch connected it should look like this:\
*Note: if you didnt it will have N/A on the cluster network*
```bash
enp1s0: 10.0.0.1
enx1c61b46ce491: 192.168.1.200
lo: 127.0.0.1
```

## Setting up DHCP server

This part is pretty straightforward; run the following commands:
- `sudo apt-get update` - update server libs and repos
- `sudo apt install isc-dhcp-server -y` - install the DHCP server
- `sudo systemctl start isc-dhcp-server` - start the server
- `sudo systemctl enable isc-dhcp-server` - enable the DHCP server to run on boot

Edit the config:
`sudo nano /etc/default/isc-dhcp-server`

You need to uncomment or add the following lines:
```
DHCPDv4_CONF=/etc/dhcp/dhcpd.conf
DHCPDv4_PID=/var/run/dhcpd.pid
```
Replace the placeholder with your cluster-facing network interface:
```
INTERFACESv4="[Your Internal Ethernet interface name here]"
```
Save and verify that the changes you made: \
`sudo cat /etc/default/isc-dhcp-server`

Example `/etc/default/isc-dhcp-server`:
```
# Defaults for isc-dhcp-server (sourced by /etc/init.d/isc-dhcp-server)

# Path to dhcpd's config file (default: /etc/dhcp/dhcpd.conf).
DHCPDv4_CONF=/etc/dhcp/dhcpd.conf
#DHCPDv6_CONF=/etc/dhcp/dhcpd6.conf

# Path to dhcpd's PID file (default: /var/run/dhcpd.pid).
DHCPDv4_PID=/var/run/dhcpd.pid
#DHCPDv6_PID=/var/run/dhcpd6.pid

# Additional options to start dhcpd with.
#       Don't use options -cf or -pf here; use DHCPD_CONF/ DHCPD_PID instead
#OPTIONS=""

# On what interfaces should the DHCP server (dhcpd) serve DHCP requests?
#       Separate multiple interfaces with spaces, e.g. "eth0 eth1".
INTERFACESv4="enp1s0"
INTERFACESv6=""
```

You also need to edit the hosts file to recognize both networks:
`sudo nano /etc/hosts`

Add `10.0.0.1 cluster` to the file, and after saving, verify with:
`sudo cat /etc/hosts`

Example:
```bash
# Standard host addresses
127.0.0.1  localhost
::1        localhost ip6-localhost ip6-loopback
ff02::1    ip6-allnodes
ff02::2    ip6-allrouters
# This host address

127.0.1.1  niftylius-z83w
10.0.0.1 cluster
```

Next step is to configure the DHCP server to serve our IP range.
To do that, edit the dhcp.conf file:

You will need to specify your own static IP address for the DHCP server, as well as be able
to assign any specific device on the network a static IP address like so:

```
      #Static IP for device with MAC address of 9A-77-42-74-C4-0D
      host cluster {
         hardware ethernet 9A-77-42-74-C4-0D;
         fixed-address 10.0.0.1;
      }
```

The first static IP address you want to set is the router. To get the MAC address, run:
`ifconfig -a | awk '/^[a-z]/ {ifname=$1} /ether / {print ifname, ip, $2}'`
You will need to add it to the dhcpd.conf.

`sudo nano /etc/dhcp/dhcpd.conf`
You need to uncomment the following lines:

```bash
ddns-update-style none;
authoritative;
log-facility local7;
```
And comment out these:
(those are related to website hosting, which you will use the load balancer for)
```bash
#option domain-name "example.org";
#option domain-name-servers ns1.example.org, ns2.example.org;
```

At the bottom of the file, please add the following config:
NOTE: *Don't forget to enter your values*
```bash
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
         hardware ethernet 71:5F:E3:4F:05:44;     #Dont forget to change with mac of your internal connection
         fixed-address 10.0.0.1;
      }
   }
}
```

Save and verify with `sudo cat /etc/dhcp/dhcpd.conf`.
Example (with removed commented-out lines - the file is way too long):
```bash
# dhcpd.conf

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
         hardware ethernet 71:5F:E3:4F:05:44;     #Dont forget to change with mac of your internal connection
         fixed-address 10.0.0.1;
      }
   }
}
```

If everything is good, restart the DHCP server:
`sudo systemctl restart isc-dhcp-server`

To check what devices are connected to the cluster network at any time, run: \
`dhcp-lease-list` \
You might need to reconnect already connected devices

If a device is connected, you should see something like this:
(You may need to reconnect all the Ethernet cables)

```bash
MAC                IP              hostname       valid until         manufacturer
===============================================================================================
9A:77:42:74:C4:0D  10.0.0.20       DESKTOP-PC     2023-03-31 14:34:54 -NA-

```

**Note:** \
*Before continuing, run `ping google.com`. If the ping doesn't work, 
it means that you have an issue with DNS resolvers. To fix that, 
you need to edit `sudo nano /etc/resolv.conf` and change the `nameserver 127.0.0.53` to `nameserver 8.8.8.8`. This may happen if you installed the OS without a network connection.*

Reboot the server ( this will be a recurring theme ): `sudo reboot`\
And test everything to ensure that things work as they should.

**Now you have a router that doesn't forward any traffic between the two subnets.**

## Set up IP forwarding between two Network Interfaces (NICs)

The next step is to allow the internal subnet (10.0.0.0/24) to be able to access the internet.
Luckily, that's fairly easy to do.

First, you need to allow IP forwarding in the sysctl.conf:
`sudo nano /etc/sysctl.conf`
Change the following lines:
```bash
net.ipv4.ip_forward=1
```

and apply with `sudo sysctl -p`\
It should show you the changes you just made.
```bash
net.ipv4.ip_forward = 1
```

Next, configure the UFW (firewall) to accept IP forward requests:
Run `sudo nano /etc/default/ufw`
and set `DEFAULT_FORWARD_POLICY="ACCEPT"`

Next, add an IP forwarding rule for the cluster network:
Run `sudo nano /etc/ufw/before.rules`

Replace with your outward-facing Network Interface Name (the one that is connected to your home network)
and add the following on the top of the page before the line `*filter`.

```bash
*nat
:POSTROUTING ACCEPT [0:0]
-A POSTROUTING -o [Home Network Interface Placeholder] -j MASQUERADE
COMMIT
```

Save changes and verify with: \
`sudo cat /etc/ufw/before.rules`

Example `/etc/ufw/before.rules`: 
```bash
...

*nat
:POSTROUTING ACCEPT [0:0]
-A POSTROUTING -o enx1c61b46ce491 -j MASQUERADE
COMMIT

# Don't delete these required lines, otherwise there will be errors
*filter
:ufw-before-input - [0:0]
:ufw-before-output - [0:0]
:ufw-before-forward - [0:0]
:ufw-not-local - [0:0]
# End required lines

...
```

Restart the server after changes: `sudo reboot` \
Next, we need to configure some security rules: \
Replace the IP and Ethernet Interface names with your values and run:

To allow the Router to communicate with the internet
```bash
sudo ufw allow out on [Home network NIC]
```

(*Not Recommended*) To allow *FULL* access from cluster network to the Router on all ports run: 
```bash
sudo ufw allow in on [Cluster Facing NIC]
```
*NOTE: you can also allow specific ports the same way`
**NOTE:** *NIC - Network Interface Card*

First, we allow the network from Cluster NIC to be sent to Home NIC, giving our cluster access to the router and our home network.

Next, we block Cluster network access to our Home network IP ranges. This means that the cluster can't access your local network.
for IPV4
```bash
#Blcok traffic from cluster NIC to Home network
sudo ufw route deny in on [Cluster Facing NIC] out on [Home network NIC] to 192.168.1.0/24
```
for IPV6 ( we don't forward ipv6 but caution never killed anyone )
```bash
#Blcok traffic from cluster NIC to Home network
sudo ufw route deny in on [Cluster Facing NIC] out on [Home network NIC] to 2a0d:6fc2:19f8::/64
```

Reload the UFW service config `sudo ufw reload`. \
Restart the UFW service with `sudo systemctl restart ufw`. \
If everything went correctly, you won't see any errors.

Check the UFW status with `sudo ufw status verbose`.
You should see something like this:
```bash
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), allow (routed)
New profiles: skip

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
22/tcp (v6)                ALLOW IN    Anywhere (v6)

Anywhere                   ALLOW OUT   Anywhere on enx1c61b46ce491
Anywhere (v6)              ALLOW OUT   Anywhere (v6) on enx1c61b46ce491

192.168.1.0/24 on enx1c61b46ce491 DENY FWD    Anywhere on enp1s0
2a0d:6fc2:19f8::/64 on enx1c61b46ce491 DENY FWD    Anywhere (v6) on enp1s0
```
Restart the server to ensure that everything is working: `sudo reboot`\

**NOTE:**\
*UFW interface blocking will only apply after restart of after along while also*\
*UFW allows pings regardless so it may be confusing when you ping 192.168.1.1 and it works* \
*to be sure try to navigate to your home router dashboard, you shouldn't be able to do so*

**BONUS**: block pings to home network as well\
Edit `sudo nano /etc/ufw/before.rules`\
Add this above the `#ok icmp code for FORWARD` line we did for IP forwarding
```bash
# deny icmp code for FORWARD
-A ufw-before-forward -p icmp --icmp-type destination-unreachable -i enp1s0 -d 192.168.1.0/24 -j DROP
-A ufw-before-forward -p icmp --icmp-type time-exceeded -i enp1s0 -d 192.168.1.0/24 -j DROP
-A ufw-before-forward -p icmp --icmp-type parameter-problem -i enp1s0 -d 192.168.1.0/24 -j DROP
-A ufw-before-forward -p icmp --icmp-type echo-request -i enp1s0 -d 192.168.1.0/24 -j DROP
```
**and restart the server (reloading and resetting didn't work for me)**`sudo reboot`\

You should be able to access the internet from your cluster network!

## Setting up the load balancer

The next step is to set up access to our cluster from the internet. To do that, you will need to install HAProxy https://www.haproxy.org/.
The idea here is to have a proxy and load balancer in one. Alternatively, you can set up NGINX to send all the traffic on specific ports directly to a specific server in your cluster.

I like things over-complicated, so I went with load balancing the entire cluster (which will have an internal load balancer as well - balan-ception!)

To do that, you need to install the HAProxy service:
- `sudo apt-get update` - update server libs and repos
- `sudo apt install haproxy -y` - install HAProxy service
- `sudo systemctl start haproxy` - start HAProxy
- `sudo systemctl enable haproxy` - enable HAProxy to run on boot

If HAProxy is not available, you will have to add it as a repo:
```
sudo add-apt-repository ppa:vbernat/haproxy-1.7
sudo apt update
sudo apt install -y haproxy
```
Once you are done, run `haproxy -v` to verify.

Next, we need to set up the proxy config:
`sudo nano /etc/haproxy/haproxy.cfg`

Enable port 80 on the firewall from any network\
`sudo ufw allow http`\
OR\
Enable only for external access ( home network or the internet )\
`sudo ufw allow in on [Home Network Interface Name] to any port 80`

At the end of the file, add:
```bash
frontend http-in
  bind 192.168.1.200:80                     #listen to port 80
  #bind 192.168.1.200:80        #listen to port 80 only in out facing IP address ( home network )
  default_backend servers       #"servers" is a name, you can call it anyway you like

backend servers
  mode http
  balance roundrobin                                #balance type: round-robin 
  option redispatch                                 #when retrying send to anotehr server instead of sticking to the same one
  retry-on conn-failure empty-response 503          #in case of failure retry on another server
  option forwardfor                                 #forward original IP as 'x-forwarded-for' header
  #option forwardfor header x-router-forwarded-for  #optionally set your own header name
  
  #next line defines the server, check every 1000ms that the server is up
  #2 successful checks meaning the server is up
  #1 failed check will mark the server as down
  server server1 10.0.0.10:80 check inter 1000 rise 2 fall 1
  #server server2 10.0.0.11:80 check inter 1000 rise 2 fall 1
  #server server3 10.0.0.12:80 check inter 1000 rise 2 fall 1
  #server server4 10.0.0.13:80 check inter 1000 rise 2 fall 1
```

*You can experiment with the configuration as you please; here is the one I have chosen for myself.
It is important to note that the list of IPs must be specific, which means that no IP range is allowed.
This is also related to the DHCP configuration we created earlier,
allowing us to set a static IP for any device on the network, such as cluster nodes in this instance.
For better understanding of HAProxy checks, refer to:
https://www.haproxy.com/documentation/aloha/latest/load-balancing/health-checks/tcp/*

Once done, save and verify with `sudo cat /etc/haproxy/haproxy.cfg`.
Open the ports you specified in the config, in my case, it's port 80 for testing:
`sudo ufw allow http` and `sudo systemctl restart ufw`

Then restart the service with `sudo systemctl restart haproxy`.

And since this is Linux, reboot the whole server with `sudo reboot`.

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
  - https://serverfault.com/questions/715742/haproxy-not-forwarding-client-headers

For use in older linux distros:
- static IP setup: 
  - https://www.cyberciti.biz/faq/add-configure-set-up-static-ip-address-on-debianlinux/
  - https://linuxconfig.org/how-to-switch-back-networking-to-etc-network-interfaces-on-ubuntu-22-04-jammy-jellyfish-linux










