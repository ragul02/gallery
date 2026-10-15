package com.gallery.app;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {
    @PluginMethod
    public void setHidden(PluginCall call) {
        boolean hidden = call.getBoolean("hidden", false);
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            ((MainActivity) activity).setNavigationBarHidden(hidden);
            call.resolve(new JSObject().put("hidden", hidden));
        });
    }
}
