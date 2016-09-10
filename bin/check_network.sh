#!/bin/bash

TEMPFILE=/tmp/network_counter.tmp

if test -n "$OPENAPS_PORT"; then
    OPENAPS_PORT=wlan0
fi

if test ! -f $TEMPFILE; then
    echo 0 > $TEMPFILE
fi

COUNTER=$[$(cat $TEMPFILE) + 1]

if test COUNTER = 4; then
    shutdown -r now
fi

/bin/ping -c 2 -I $OPENAPS_PORT google.com > /dev/null 2> /dev/null
if [ $? -ge 1 ] ; then
    echo "Network connection down! Attempting reconnection, count $COUNTER"
    echo $COUNTER > $TEMPFILE
    /sbin/ifdown $OPENAPS_PORT
    /bin/sleep 5
    /sbin/ifup --force $OPENAPS_PORT
else
    echo "Network is up, count $COUNTER"
    echo 0 > $TEMPFILE
fi 2>&1 | logger &

