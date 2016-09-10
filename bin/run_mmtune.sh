#! /bin/sh
# This should set the core radio settings back to the same settings that
# mmcommander uses for the EU radios, rather than the subg_rfspy params
# This uses the commands from https://github.com/ps2/subg_rfspy/blob/master/commands.c
# to change the settings from https://github.com/ps2/subg_rfspy/blob/dev/radio.c to
# and the settings from https://github.com/oskarpearson/mmcommander/blob/master/src/MMCommander/init.c

mkdir /mnt/tmpfs/monitor
mkdir /mnt/tmpfs/upload
mkdir /mnt/tmpfs/settings

# If you're on an ERF, set this to 0:
export RFSPY_RTSCTS=0

#In the subg_rfspy/tools dir:

cd ~/dev/subg_rfspy/tools
# Reset to defaults
./reset.py /dev/ttyMFD1

sleep 1

./change_setting.py /dev/ttyMFD1 0x06 0x00          # CHANNR
./change_setting.py /dev/ttyMFD1 0x0C 0x59          # MDMCFG4
./change_setting.py /dev/ttyMFD1 0x0D 0x66          # MDMCFG3
./change_setting.py /dev/ttyMFD1 0x0E 0x33          # MDMCFG2
./change_setting.py /dev/ttyMFD1 0x0F 0x62          # MDMCFG1
./change_setting.py /dev/ttyMFD1 0x10 0x1A          # MDMCFG0

./change_setting.py /dev/ttyMFD1 0x11 0x13          # DEVIATN

./change_setting.py /dev/ttyMFD1 0x09 0x24          # FREQ2
./change_setting.py /dev/ttyMFD1 0x0A 0x2E          # FREQ1
./change_setting.py /dev/ttyMFD1 0x0B 0x38          # FREQ0

cd /home/edison/dev/mmeowlink/bin

./mmtune.py --port /dev/ttyMFD1 --serial 450960 --radio_locale WW >/home/edison/eerops/monitor/mmtune.json

exit 0
