DearSelf V46.5 — Auto Backup Real-State Fix

Automatic backups now use the exact same root JSON structure as DearSelf's normal Export backup.
The previous automatic backup wrapped state inside {data: ...}, while the importer expects the state at the top level. V46.5 removes that wrapper.

The backup is read back and parsed after writing before DearSelf records the backup as successful.
Embedded files are still copied to the timestamped DearSelf Files folder.
