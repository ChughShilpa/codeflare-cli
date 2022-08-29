#!/usr/bin/env bash

set -e
set -o pipefail

SCRIPTDIR=$(cd $(dirname "$0") && pwd)

echo "Starting CodeFlare self-test"

export KUBE_NS_FOR_REAL=$(kubectl get job codeflare-self-test -o custom-columns=NS:.metadata.namespace --no-headers)
echo "Kubernetes namespace: $KUBE_NS_FOR_REAL"

if [ -n "$VARIANTS" ]; then
    variants=$VARIANTS
else
    variants="gpu1 non-gpu1"
fi
echo "Using these variants: $variants"

function cleanup {
    STATUS=$?

    TEAMID=$SLACK_TEAMID
    CHANNELID=$SLACK_CHANNELID
    TOKEN=$SLACK_TOKEN
    USERNAME=${SLACK_USERNAME-"Self-test Bot"}

    if [ -n "$TEAMID" ] && [ -n "$CHANNELID" ] && [ -n "$TOKEN" ]; then
        if [ "$STATUS" = "0" ]; then
            ICON=":green_heart:"
            TEXT="$(date)\nSuccessful run\nVariants: $variants"
        else
            ICON=":red-siren:"
            TEXT="$(date)\nFailed run\nVariants: $variants"
            # TODO, add tee'd logs of failing run
        fi


        curl -X POST \
             --data-urlencode "payload={\"channel\": \"#$CHANNEL\", \"username\": \"$USERNAME\", \"text\": \"$TEXT\", \"icon_emoji\": \"$ICON\"}" \
             https://hooks.slack.com/services/$TEAMID/$CHANNELID/$TOKEN
    fi
}

trap "cleanup" EXIT

for variant in $variants; do
    # for profile in ./tests/kind/profiles/*; do
    for profile in $variant/keep-it-simple; do
        echo "================== $profile =================="
        # TODO tee logs so that we can send them to slack
        ./tests/kind/run.sh -i $profile
    done
done
