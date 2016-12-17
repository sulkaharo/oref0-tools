#! /bin/sh
# This should set the core radio settings back to the same settings that
# mmcommander uses for the EU radios, rather than the subg_rfspy params
# This uses the commands from https://github.com/ps2/subg_rfspy/blob/master/commands.c
# to change the settings from https://github.com/ps2/subg_rfspy/blob/dev/radio.c to
# and the settings from https://github.com/oskarpearson/mmcommander/blob/master/src/MMCommander/init.c

# If you're on an ERF, set this to 0:

if test ! -n "$RFSPY_RTSCTS"; then
    echo "RFSPY_RTSCTS env variable missing, defaulting to 0"
    export RFSPY_RTSCTS=0
fi

if test ! -n "$OPENAPS_DEVICE"; then
    echo "OPENAPS_DEVICE env variable missing, defaulting to /dev/ttyMFD1"
    export OPENAPS_DEVICE=/dev/ttyMFD1
fi

if test ! -n "$SUBG_RFSPY_LOCATION"; then
    echo "SUBG_RFSPY_LOCATION env variable missing, defaulting to ~/dev/subg_rfspy/"
    export SUBG_RFSPY_LOCATION=~/dev/subg_rfspy/
fi

if test ! -n "$SUBG_RFSPY_RADIOMODE"; then
    echo "SUBG_RFSPY_RADIOMODE env variable missing, defaulting to WW"
    export SUBG_RFSPY_RADIOMODE=WW
fi

if test ! -n "$OPENAPS_HOME"; then
    echo "OPENAPS_HOME env variable missing, defaulting to ~/loop_home"
    export OPENAPS_HOME=~/loop_home
fi


#In the subg_rfspy/tools dir:

cd $SUBG_RFSPY_LOCATION/tools
# Reset to defaults
./reset.py $OPENAPS_DEVICE

sleep 1

./change_setting.py $OPENAPS_DEVICE 0x06 0x00          # CHANNR
./change_setting.py $OPENAPS_DEVICE 0x0C 0x59          # MDMCFG4
./change_setting.py $OPENAPS_DEVICE 0x0D 0x66          # MDMCFG3
./change_setting.py $OPENAPS_DEVICE 0x0E 0x33          # MDMCFG2
./change_setting.py $OPENAPS_DEVICE 0x0F 0x62          # MDMCFG1
./change_setting.py $OPENAPS_DEVICE 0x10 0x1A          # MDMCFG0

./change_setting.py $OPENAPS_DEVICE 0x11 0x13          # DEVIATN

./change_setting.py $OPENAPS_DEVICE 0x09 0x24          # FREQ2
./change_setting.py $OPENAPS_DEVICE 0x0A 0x2E          # FREQ1
./change_setting.py $OPENAPS_DEVICE 0x0B 0x38          # FREQ0

cd /home/edison/dev/mmeowlink/bin

./mmtune.py --port /dev/ttyMFD1 --serial 450960 --radio_locale $SUBG_RFSPY_RADIOMODE >$OPENAPS_HOME/monitor/mmtune.json

exit 0
