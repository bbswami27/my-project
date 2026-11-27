package com.chatterpatter.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

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
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getContacts(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "contactsPermCallback");
            return;
        }
        executor.execute(() -> readContacts(call));
    }

    @PermissionCallback
    private void contactsPermCallback(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            executor.execute(() -> readContacts(call));
        } else {
            call.reject("Permission denied to read contacts");
        }
    }

    private void readContacts(PluginCall call) {
        // Read one contact per Android contact ID, including EMAIL-ONLY entries.
        // Previously querying Phone.CONTENT_URI excluded all email-only contacts.
        JSArray results = new JSArray();
        java.util.LinkedHashMap<String, JSObject> contacts = new java.util.LinkedHashMap<>();
        java.util.HashMap<String, JSArray> numbers = new java.util.HashMap<>();
        java.util.HashMap<String, JSArray> emails = new java.util.HashMap<>();
        java.util.HashMap<String, Set<String>> seenPhones = new java.util.HashMap<>();
        java.util.HashMap<String, Set<String>> seenEmails = new java.util.HashMap<>();
        ContentResolver cr = getContext().getContentResolver();
        String[] columns = {
            ContactsContract.Data.CONTACT_ID,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY,
            ContactsContract.Data.MIMETYPE,
            ContactsContract.Data.DATA1
        };
        String selection = ContactsContract.Data.MIMETYPE + " IN (?, ?)";
        String[] selectionArgs = {
            ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE,
            ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE
        };
        try (Cursor cursor = cr.query(
            ContactsContract.Data.CONTENT_URI, columns, selection, selectionArgs,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY + " ASC"
        )) {
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(ContactsContract.Data.CONTACT_ID);
                int nameColumn = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY);
                int typeColumn = cursor.getColumnIndexOrThrow(ContactsContract.Data.MIMETYPE);
                int valueColumn = cursor.getColumnIndexOrThrow(ContactsContract.Data.DATA1);
                while (cursor.moveToNext()) {
                    String id = cursor.getString(idColumn);
                    String value = cursor.getString(valueColumn);
                    String type = cursor.getString(typeColumn);
                    if (id == null || value == null || value.trim().isEmpty()) continue;
                    value = value.trim();
                    if (!contacts.containsKey(id)) {
                        JSObject obj = new JSObject();
                        String name = cursor.getString(nameColumn);
                        obj.put("contactId", id);
                        obj.put("name", name == null || name.trim().isEmpty() ? "Contact" : name.trim());
                        obj.put("displayName", name == null || name.trim().isEmpty() ? "Contact" : name.trim());
                        contacts.put(id, obj);
                        numbers.put(id, new JSArray());
                        emails.put(id, new JSArray());
                        seenPhones.put(id, new HashSet<>());
                        seenEmails.put(id, new HashSet<>());
                    }
                    if (ContactsContract.CommonDataKinds.Email.CONTENT_ITEM_TYPE.equals(type)) {
                        String email = value.toLowerCase(java.util.Locale.ROOT);
                        if (email.contains("@") && seenEmails.get(id).add(email)) emails.get(id).put(email);
                    } else if (ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE.equals(type)) {
                        String digits = value.replaceAll("[^0-9]", "");
                        if (digits.length() >= 10 && seenPhones.get(id).add(digits)) numbers.get(id).put(value);
                    }
                }
            }
            for (String id : contacts.keySet()) {
                JSArray p = numbers.get(id), e = emails.get(id);
                if (p.length() == 0 && e.length() == 0) continue;
                JSObject obj = contacts.get(id);
                obj.put("phones", p);
                obj.put("phoneNumbers", p);
                obj.put("emails", e);
                if (p.length() > 0) {
                    obj.put("phone", p.optString(0));
                    obj.put("phoneNumber", p.optString(0));
                }
                if (e.length() > 0) obj.put("email", e.optString(0));
                results.put(obj);
            }
            JSObject payload = new JSObject();
            payload.put("contacts", results);
            call.resolve(payload);
        } catch (Exception ex) {
            call.reject("Unable to read phonebook: " + ex.getMessage());
        }
    }

    @PluginMethod
    public void openContactsApp(PluginCall call) {
        try {
            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW);
            intent.setData(ContactsContract.Contacts.CONTENT_URI);
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            try {
                android.content.Intent fallback = new android.content.Intent(android.content.Intent.ACTION_MAIN);
                fallback.addCategory(android.content.Intent.CATEGORY_APP_CONTACTS);
                fallback.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception ex) {
                call.reject("Could not launch phonebook: " + ex.getMessage());
            }
        }
    }

    @PluginMethod
    public void openNewContactScreen(PluginCall call) {
        try {
            String name = call.getString("name", "");
            String phone = call.getString("phone", "");
            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_INSERT);
            intent.setType(ContactsContract.Contacts.CONTENT_TYPE);
            if (!name.isEmpty()) {
                intent.putExtra(ContactsContract.Intents.Insert.NAME, name);
            }
            if (!phone.isEmpty()) {
                intent.putExtra(ContactsContract.Intents.Insert.PHONE, phone);
            }
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open new contact screen: " + e.getMessage());
        }
    }
}
