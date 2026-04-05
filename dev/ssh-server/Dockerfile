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

# Create test user with sudo
RUN useradd -m -s /bin/bash testuser \
    && echo 'testuser:testpass' | chpasswd \
    && usermod -aG sudo testuser \
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

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D"]
