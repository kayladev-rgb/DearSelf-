DearSelf V40 Beta — Local Device Sync

1. Put both devices on the SAME Wi-Fi/network.
2. On one computer, install Node.js if needed.
3. In this folder run:
   node dearself-sync-bridge.js
4. In DearSelf, open Settings -> DearSelf Devices.
5. On the computer running the bridge choose Link another device.
6. Use the bridge address shown by the terminal on the other device (for example http://192.168.1.20:8787).
7. Enter the DearSelf ID Key and the 6-digit pairing code.
8. Approve the new device on the first device.
9. Once paired, use Sync when both devices are on the same network.

No DearSelf cloud database is used. The bridge only relays messages between the two connected devices and does not save DearSelf data to disk.

Note: Windows Firewall may ask to allow Node.js on Private networks. Allow it only on your trusted local network.
