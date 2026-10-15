package com.gallery.app;

import com.getcapacitor.BridgeActivity;
import android.view.View;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(MediaStorePlugin.class);
        registerPlugin(SystemBarsPlugin.class);
        super.onCreate(savedInstanceState);
        setNavigationBarHidden(true);
    }

    private boolean navigationBarHidden = true;

    void setNavigationBarHidden(boolean hidden) {
        navigationBarHidden = hidden;
        applyNavigationBarVisibility();
    }

    private void applyNavigationBarVisibility() {
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
        if (navigationBarHidden) {
            flags |= View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        }
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyNavigationBarVisibility();
    }
}
