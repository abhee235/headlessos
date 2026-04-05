# Local Ubuntu SSH server for HeadlessOS development/testing
# Usage: docker compose up -d
# Connect: ssh testuser@localhost -p 2222 (password: testpass)

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    openssh-server \
    sudo \
    curl \
    wget \
    git \
    htop \
    net-tools \
    iproute2 \
    procps \
    vim \
    tree \
    nginx \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Configure SSH
RUN mkdir /var/run/sshd
RUN sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Install Docker CLI (daemon runs on host via mounted socket)
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Create test user with sudo + docker group
RUN groupadd -f docker \
    && useradd -m -s /bin/bash testuser \
    && echo 'testuser:testpass' | chpasswd \
    && usermod -aG sudo,docker testuser \
    && echo 'testuser ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Also set root password for testing
RUN echo 'root:rootpass' | chpasswd

# Create some sample files for testing file explorer
RUN mkdir -p /home/testuser/projects/myapp \
    && echo '# My App\nA sample project' > /home/testuser/projects/myapp/README.md \
    && echo 'console.log("hello")' > /home/testuser/projects/myapp/index.js \
    && echo '{"name": "myapp"}' > /home/testuser/projects/myapp/package.json \
    && mkdir -p /home/testuser/documents \
    && echo 'Some notes here' > /home/testuser/documents/notes.txt \
    && chown -R testuser:testuser /home/testuser

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22

CMD ["/entrypoint.sh"]
