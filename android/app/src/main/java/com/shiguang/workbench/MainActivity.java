package com.shiguang.workbench;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(WorkbenchNativePlugin.class);
        super.onCreate(savedInstanceState);
        preferHighestRefreshRate();
    }

    @Override
    public void onResume() {
        super.onResume();
        preferHighestRefreshRate();
    }

    private void preferHighestRefreshRate() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

        Display display = getWindowManager().getDefaultDisplay();
        Display.Mode currentMode = display.getMode();
        Display.Mode bestMode = currentMode;

        for (Display.Mode mode : display.getSupportedModes()) {
            boolean sameResolution =
                mode.getPhysicalWidth() == currentMode.getPhysicalWidth()
                    && mode.getPhysicalHeight() == currentMode.getPhysicalHeight();
            if (sameResolution && mode.getRefreshRate() > bestMode.getRefreshRate()) {
                bestMode = mode;
            }
        }

        WindowManager.LayoutParams attributes = getWindow().getAttributes();
        attributes.preferredDisplayModeId = bestMode.getModeId();
        attributes.preferredRefreshRate = bestMode.getRefreshRate();
        getWindow().setAttributes(attributes);
    }
}
