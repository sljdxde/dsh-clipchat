#!/bin/sh
# The workspace directory ends with a space; installers trim it. Link a clean path.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
target=/tmp/dsh-clipchat-dev
ln -sfn "$root" "$target"
echo "dev link: $target -> $root"
echo "install with plugin_manager install_bundle target: $target"
