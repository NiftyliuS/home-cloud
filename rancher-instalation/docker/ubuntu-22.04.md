

## Installing docker:

As all good things in linux, start with an update:
```shell
sudo apt update
```

Next install all the dependencies for docker:
```shell
sudo apt install apt-transport-https ca-certificates curl software-properties-common -y
```

Add Docker's official GPG key and repository:
```shell
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

Now update ( again )
```shell
sudo apt update
```

Now you can install docker:
```shell
sudo apt install docker-ce -y
```

And finally set docker to run after restart or boot:
```shell
sudo systemctl enable docker
sudo systemctl start docker
```

Check installation:
```shell
sudo systemctl status docker
docker --version
docker run hello-world
```


## Sources:
- docker installation
  - ChatGPT 
  - https://cloudcone.com/docs/article/how-to-install-docker-on-ubuntu-22-04-20-04/