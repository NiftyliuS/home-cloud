
# Rancher installation on ubuntu 22.04

I mean you could go to rancher website and look there: \
https://ranchermanager.docs.rancher.com/v2.5/pages-for-subheaders/rancher-on-a-single-node-with-docker

But I am going to write here anyway.

Please note that this is not the secure version of Rancher, By default rancher is installed with a self signed ssl certificate.

To install rancher with a better certificate ( especially if rancher is exposed to the internet ) please reffer to:
https://ranchermanager.docs.rancher.com/v2.5/pages-for-subheaders/rancher-on-a-single-node-with-docker

I am running rancher in a segregated network so for now self-signed will work for me:
Run the docker command:
```shell
docker run -d --restart=unless-stopped \
  -p 80:80 -p 443:443 \
  --privileged \
  rancher/rancher:latest
```
`NOTE: You may need sudo`

# Exposing rancher on a specific NIC with haproxy

## However!
Since i already designated 192.168.1.200 for the cluster access point, we cant run rancher there. \
Luckily its linux and we can do all sort of weird things in here.

So what we will do is assign 2 IP addresses to the home network interface, to do that:
List the network config YAML files:
`ls /etc/netplan`
You should see a list of YAML files you can edit. In my case, I have [01-network-manager-all.yaml](./2-nics-sample-config.yaml.yml).

## Add another IP address ( 192.168.1.201 )
To add another IP address using netplan simply edit the netplan yaml like so:\
`sudo nano /etc/netplan/01-network-manager-all.yaml`

And add another IP to the IP list \
`!IMPORTANT: we setup forwarding from cluster to outside but not vice versa, the new IP must be added to home network and not to the cluster network!`
```shell
network:
  version: 2
  renderer: networkd
  ethernets:
    enx1c61b46ce491:
      dhcp4: false
      dhcp6: false
      addresses:
        - 192.168.1.200/24                #Home network static IP
        - 192.168.1.201/24  # << add this #Home network virtual IP for Rancher
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

Then run 
```shell
sudo netplan try
```

And if errors occur apply the changes
```shell
sudo netplan apply
```

You will need to re-connect the cable ( or restart )\
You can then check with:
```shell
ip addr show [your_interface_name]
```


If all went well you will now have 2 IPs for the Router (Linux is the best!)
So now i will assign the rancher docker to listen to the 2nd IP address that we just added
```shell
sudo docker run -d --restart=unless-stopped -p 192.168.1.201:80:80 -p 192.168.1.201:443:443 --privileged rancher/rancher:latest
```
`NOTE: It may take a while for rancher UI to be avialble so make a coffee or three`

Next step is to allow access from the home network and the cluster network via UFW (Uncomplicated FireWall) to the Router via the new IP on 80 and 443 ports: \
`It is important to allow the cluster to access rancher as well as home network otherwise rancher won't be able to manage the cluster`

```shell
#From Cluster network ( NIC eps01 ):
sudo ufw allow in on eps01 from 10.0.0.0/24 to 192.168.1.201 port 80
sudo ufw allow in on eps01 from 10.0.0.0/24 to 192.168.1.201 port 443

#From Home network ( NIC enx1c61b46ce491 ):
sudo ufw allow in on enx1c61b46ce491 from 192.168.1.0/24 to 192.168.1.201 port 80
sudo ufw allow in on enx1c61b46ce491 from 192.168.1.0/24 to 192.168.1.201 port 443
```

Your routing should look something like this:
```shell
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), allow (routed)
New profiles: skip

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere

#new Rules:
192.168.1.201 80 on enx1c61b46ce491 ALLOW IN    192.168.1.0/24
192.168.1.201 443 on enx1c61b46ce491 ALLOW IN    192.168.1.0/24
192.168.1.201 80 on eps01  ALLOW IN    10.0.0.0/24
192.168.1.201 443 on eps01 ALLOW IN    10.0.0.0/24

22/tcp (v6)                ALLOW IN    Anywhere (v6)

Anywhere                   ALLOW OUT   Anywhere on enx1c61b46ce491
Anywhere (v6)              ALLOW OUT   Anywhere (v6) on enx1c61b46ce491

192.168.1.0/24 on enx1c61b46ce491 DENY FWD    Anywhere on enp1s0
2a0d:6fc2:19f8::/64 on enx1c61b46ce491 DENY FWD    Anywhere (v6) on enp1s0
```

## SSH Security:
```shell
# NOTE: you might have notices i am leaving SSH open to all ports,
# this is on purpose to ease the testing and deployment but 
# if you want to prevent the cluster network using routers SSH 
# just adjust the rule like so:

# add the new rule first (!important to not get locked out)
sudo ufw allow in on enx1c61b46ce491 from 192.168.1.0/24 to 192.168.1.200 port 22
# or allow access through the new IP
sudo ufw allow in on enx1c61b46ce491 from 192.168.1.0/24 to 192.168.1.201 port 22 

# then run 
sudo ufw status numbered

# then delete the old TCP rule by number
sudo ufw delete [your rule number here]

# verify
sudo ufw status verbose 



#Your rules will look something like this:
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), allow (routed)
New profiles: skip

To                         Action      From
--                         ------      ----
192.168.1.201 80 on enx1c61b46ce491 ALLOW IN    192.168.1.0/24
192.168.1.201 443 on enx1c61b46ce491 ALLOW IN    192.168.1.0/24
192.168.1.201 80 on eps01  ALLOW IN    10.0.0.0/24
192.168.1.201 443 on eps01 ALLOW IN    10.0.0.0/24
192.168.1.200 22 on enx1c61b46ce491 ALLOW IN    192.168.1.0/24
192.168.1.201 22 on enx1c61b46ce491 ALLOW IN    192.168.1.0/24

Anywhere                   ALLOW OUT   Anywhere on enx1c61b46ce491
Anywhere (v6)              ALLOW OUT   Anywhere (v6) on enx1c61b46ce491

192.168.1.0/24 on enx1c61b46ce491 DENY FWD    Anywhere on enp1s0
2a0d:6fc2:19f8::/64 on enx1c61b46ce491 DENY FWD    Anywhere (v6) on enp1s0
```

## Rancher Server Setup

Once we have all the rules and IPs figured out we can continue to rancher UI and setup. \
In the browser navigate to https://192.168.1.201/

The browser will not be happy since we are using SelfSigned SSL certificate. \
Since Rancher is never exposed to the internet this is fine, \
simply click on `Advanced` and `Proceed to 192.168.1.201 (unsafe)`

Rancher will guide you through the setup process from here.
But in case you are not familiar with docker
```shell
# To find the container ID run 
docker ps 
# OR 
sudo docker ps

# Then run the code to extract the one time password that rancher generates:
docker logs  [your container id]  2>&1 | grep "Bootstrap Password:"
# if that doesnt work try sudo
sudo docker logs  [your container id]  2>&1 | grep "Bootstrap Password:"
```
And don't forget to accept the end user license. \
In case Chrome still complains do as before: `Advanced` and `Proceed to 192.168.1.201 (unsafe)`

## Creating RKE kubernetes cluster with rancher


 