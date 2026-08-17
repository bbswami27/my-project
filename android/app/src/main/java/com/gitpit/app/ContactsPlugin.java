package com.gitpit.app;

import android.Manifest;
import android.content.ContentResolver;
import android.database.Cursor;
import android.provider.ContactsContract;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.HashSet;
import java.util.Set;

@CapacitorPlugin(
    name = "Contacts",
    permissions = {
        @Permission(
            alias = "contacts",
            strings = { Manifest.permission.READ_CONTACTS }
        )
    }
)
public class ContactsPlugin extends Plugin {

    @PluginMethod
    public void getContacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "contactsPermCallback");
            return;
        }

        readContacts(call);
    }

    @PermissionCallback
    private void contactsPermCallback(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            readContacts(call);
        } else {
            call.reject("Permission denied to read contacts");
        }
    }

    private void readContacts(PluginCall call) {
        JSArray contactsArray = new JSArray();
        Set<String> seen = new HashSet<>();
        ContentResolver cr = getContext().getContentResolver();

        String[] projection = new String[] {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        };

        try (Cursor cursor = cr.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            projection,
            null,
            null,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
        )) {
            if (cursor != null) {
                int nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int numberIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);

                while (cursor.moveToNext()) {
                    String name = nameIdx != -1 ? cursor.getString(nameIdx) : "";
                    String number = numberIdx != -1 ? cursor.getString(numberIdx) : "";

                    if (number != null && !number.trim().isEmpty()) {
                        String clean = number.replaceAll("\\D", "");
                        if (clean.length() >= 10) {
                            String key = clean.substring(Math.max(0, clean.length() - 10));
                            if (!seen.contains(key)) {
                                seen.add(key);
                                JSObject contact = new JSObject();
                                contact.put("name", name != null && !name.trim().isEmpty() ? name.trim() : "Friend");
                                contact.put("phone", number.trim());
                                contact.put("phoneNumber", number.trim());
                                contactsArray.put(contact);
                            }
                        }
                    }
                }
            }

            JSObject result = new JSObject();
            result.put("contacts", contactsArray);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to read contacts: " + e.getMessage());
        }
    }
}
