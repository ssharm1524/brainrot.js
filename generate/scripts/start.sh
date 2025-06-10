#!/bin/bash

# Remove existing container if it's running
docker rm -f brainrot-container 2>/dev/null || true

# Validate VIDEO_MODE
valid_modes=("brainrot" "podcast" "monologue")
if [ -n "$VIDEO_MODE" ] && [[ ! " ${valid_modes[@]} " =~ " ${VIDEO_MODE} " ]]; then
    echo "Error: Invalid VIDEO_MODE '${VIDEO_MODE}'"
    echo "Valid modes are: ${valid_modes[*]}"
    echo "Example usage: VIDEO_MODE=podcast ./scripts/start.sh"
    exit 1
fi

# Store the current absolute path to avoid issues with `eval` and `pwd`
# Using -P to resolve any symbolic links and ensure a physical path.
CURRENT_DIR="$(pwd -P)"

CMD="docker run --name brainrot-container"

CMD="$CMD -e MODE=${MODE:-dev}"
CMD="$CMD -e VIDEO_MODE=${VIDEO_MODE:-brainrot}"

# Mount directories for non-production modes
if [ "${MODE}" != "production" ]; then
    echo "Local mode: Mounting source directories"
    # Crucially, double-quote the volume mount paths to handle spaces in CURRENT_DIR
    CMD="$CMD -v \"${CURRENT_DIR}/out:/app/brainrot/out\""
    # Add development bind mounts
    CMD="$CMD -v \"${CURRENT_DIR}/src:/app/brainrot/src\""
    CMD="$CMD -v \"${CURRENT_DIR}/public:/app/brainrot/public\""
    CMD="$CMD -v \"${CURRENT_DIR}/.env:/app/brainrot/.env\""
    CMD="$CMD -v \"${CURRENT_DIR}/audioGenerator.ts:/app/brainrot/audioGenerator.ts\""
    CMD="$CMD -v \"${CURRENT_DIR}/localBuild.ts:/app/brainrot/localBuild.ts\""
    CMD="$CMD -v \"${CURRENT_DIR}/cleanSrt.ts:/app/brainrot/cleanSrt.ts\""
    CMD="$CMD -v \"${CURRENT_DIR}/concat.ts:/app/brainrot/concat.ts\""
    CMD="$CMD -v \"${CURRENT_DIR}/transcript.ts:/app/brainrot/transcript.ts\""
    CMD="$CMD -v \"${CURRENT_DIR}/transcribe.ts:/app/brainrot/transcribe.ts\""
fi

# Additional mounts for studio mode
if [ "${MODE}" = "studio" ]; then
    echo "Studio mode: Mounting additional directories"
    # Double-quote here as well
    CMD="$CMD -v \"${CURRENT_DIR}/public:/app/brainrot/public\""
    CMD="$CMD -v \"${CURRENT_DIR}/src/tmp:/app/brainrot/src/tmp\""
fi

# Only run detached in production
if [ "${MODE}" = "production" ]; then
    CMD="$CMD -d"
fi

# Add the image name
CMD="$CMD brainrot"

# Execute the constructed Docker command
# 'eval' is used because the CMD variable is being built up incrementally.
eval "$CMD"

# Check the exit status of the docker run command
if [ $? -ne 0 ]; then
    echo "Error: Docker container failed to start."
    exit 1
fi

if [ "${MODE}" = "studio" ]; then
    echo "Container finished, starting development server..."
    bun run start
fi