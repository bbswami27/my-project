package com.chatterpatter.app;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

// The user grants call permissions once when actually starting/answering a call,
// not on every application startup.
@CapacitorPlugin(name = "CallPermissions", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
    @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
})
public class CallPermissionsPlugin extends Plugin {
    @PluginMethod
    public void requestMediaPermissions(PluginCall call) {
        boolean video = Boolean.TRUE.equals(call.getBoolean("video", false));
        boolean micOk = getPermissionState("microphone") == PermissionState.GRANTED;
        boolean cameraOk = getPermissionState("camera") == PermissionState.GRANTED;
        if (micOk && (!video || cameraOk)) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (video) {
            requestPermissionForAliases(new String[]{"microphone", "camera"}, call, "mediaPermissionResult");
        } else {
            requestPermissionForAlias("microphone", call, "mediaPermissionResult");
        }
    }

    @PermissionCallback
    private void mediaPermissionResult(PluginCall call) {
        boolean video = Boolean.TRUE.equals(call.getBoolean("video", false));
        if (getPermissionState("microphone") == PermissionState.GRANTED &&
            (!video || getPermissionState("camera") == PermissionState.GRANTED)) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
        } else {
            call.reject("Please enable Microphone/Camera permissions to use calling.");
        }
    }
}
