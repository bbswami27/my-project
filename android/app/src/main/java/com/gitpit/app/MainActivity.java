package com.gitpit.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.net.Uri;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register Native Contacts Plugin
        registerPlugin(ContactsPlugin.class);

        super.onCreate(savedInstanceState);
        
        // 1. Request Runtime Permissions on Launch
        requestAllPermissions();

        // 2. Enhance Bridge WebChromeClient for WebRTC, Geolocation & File Chooser
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
                @Override
                public void onPermissionRequest(final PermissionRequest request) {
                    runOnUiThread(() -> {
                        request.grant(request.getResources());
                    });
                }

                @Override
                public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                    callback.invoke(origin, true, false);
                }
            });
        }
    }

    private void requestAllPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            java.util.List<String> permList = new java.util.ArrayList<>();
            permList.add(Manifest.permission.CAMERA);
            permList.add(Manifest.permission.RECORD_AUDIO);
            permList.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);
            permList.add(Manifest.permission.READ_CONTACTS);
            permList.add(Manifest.permission.ACCESS_FINE_LOCATION);
            permList.add(Manifest.permission.ACCESS_COARSE_LOCATION);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                permList.add(Manifest.permission.POST_NOTIFICATIONS);
                permList.add(Manifest.permission.READ_MEDIA_IMAGES);
                permList.add(Manifest.permission.READ_MEDIA_VIDEO);
                permList.add(Manifest.permission.READ_MEDIA_AUDIO);
            } else {
                permList.add(Manifest.permission.READ_EXTERNAL_STORAGE);
                permList.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            }

            java.util.List<String> toRequest = new java.util.ArrayList<>();
            for (String perm : permList) {
                if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                    toRequest.add(perm);
                }
            }

            if (!toRequest.isEmpty()) {
                ActivityCompat.requestPermissions(this, toRequest.toArray(new String[0]), PERMISSION_REQ_CODE);
            }
        }
    }
}
