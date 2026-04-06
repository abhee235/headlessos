#!/bin/bash
# Entrypoint: fix Docker socket perms then start sshd

# If Docker socket is mounted, ensure the container's 'docker' group
# has the same GID as the socket so testuser can use it without sudo.
if [ -S /var/run/docker.sock ]; then
  SOCK_GID=$(stat -c '%g' /var/run/docker.sock)
  if [ "$SOCK_GID" != "0" ]; then
    groupmod -g "$SOCK_GID" docker 2>/dev/null || true
  else
    # Socket owned by root — make it group-accessible
    chmod 666 /var/run/docker.sock
  fi
fi

exec /usr/sbin/sshd -D
