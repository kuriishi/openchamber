package com.openchamber.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.FirebaseApp;

/** Hands the web layer this phone's push seal key (see PushSealKey). */
@CapacitorPlugin(name = "PushKey")
public class PushKeyPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        JSObject result = new JSObject();
        result.put("key", PushSealKey.get(getContext()));
        call.resolve(result);
    }

    /**
     * Whether Firebase was initialized. A build without google-services.json has no
     * FirebaseApp, and the push plugin's register() then crashes the app natively.
     */
    @PluginMethod
    public void messaging(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", !FirebaseApp.getApps(getContext()).isEmpty());
        call.resolve(result);
    }
}
