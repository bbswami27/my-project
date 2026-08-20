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
        JSArray contactsArray = new JSArray();
        Set<String> seen = new HashSet<>();
        ContentResolver cr = getContext().getContentResolver();

        String[] projection = new String[] {
            ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.PHOTO_THUMBNAIL_URI,
            ContactsContract.CommonDataKinds.Phone.PHOTO_URI
        };

        String selection = ContactsContract.Contacts.HAS_PHONE_NUMBER + " > 0";
        String sortOrder = ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY + " ASC";

        try (Cursor cursor = cr.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            projection,
            selection,
            null,
            sortOrder
        )) {
            if (cursor != null) {
                int contactIdIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
                int nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY);
                if (nameIdx == -1) {
                    nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                }
                int numberIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                int photoThumbIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.PHOTO_THUMBNAIL_URI);
                int photoUriIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.PHOTO_URI);

                while (cursor.moveToNext()) {
                    String name = nameIdx != -1 ? cursor.getString(nameIdx) : "";
                    String number = numberIdx != -1 ? cursor.getString(numberIdx) : "";

                    if (number != null && !number.trim().isEmpty()) {
                        String clean = number.replaceAll("\\D", "");
                        if (clean.length() >= 10) {
                            String key = clean.substring(Math.max(0, clean.length() - 10));
                            if (!seen.contains(key)) {
                                seen.add(key);

                                String finalPhoto = "";
                                if (contactIdIdx != -1) {
                                    long cid = cursor.getLong(contactIdIdx);
                                    if (cid > 0) {
                                        Uri contactUri = ContentUris.withAppendedId(ContactsContract.Contacts.CONTENT_URI, cid);
                                        try (InputStream is = ContactsContract.Contacts.openContactPhotoInputStream(cr, contactUri, false)) {
                                            if (is != null) {
                                                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                                                byte[] buf = new byte[2048];
                                                int r;
                                                while ((r = is.read(buf)) != -1) {
                                                    baos.write(buf, 0, r);
                                                }
                                                byte[] b = baos.toByteArray();
                                                if (b.length > 0) {
                                                    finalPhoto = "data:image/jpeg;base64," + Base64.encodeToString(b, Base64.NO_WRAP);
                                                }
                                            }
                                        } catch (Exception ignored) {}
                                    }
                                }

                                JSObject contact = new JSObject();
                                String finalName = (name != null && !name.trim().isEmpty()) ? name.trim() : "Friend";
                                contact.put("name", finalName);
                                contact.put("phone", number.trim());
                                contact.put("phoneNumber", "+91" + key);
                                contact.put("photoUri", finalPhoto);
                                contact.put("avatar", finalPhoto);
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
