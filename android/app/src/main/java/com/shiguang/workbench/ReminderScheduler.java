package com.shiguang.workbench;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONObject;

import java.util.Map;

final class ReminderScheduler {
    private static final String ACTION = "com.shiguang.workbench.REMINDER_ALARM";
    private static final String STORE = "shiguang_native_reminders";

    private ReminderScheduler() {}

    static boolean canScheduleExact(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return context.getSystemService(AlarmManager.class).canScheduleExactAlarms();
    }

    static boolean schedule(Context context, int id, String title, long triggerAt, boolean persist) {
        if (triggerAt <= System.currentTimeMillis()) return false;
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        PendingIntent alarmIntent = pendingIntent(context, id, title, triggerAt);
        boolean exact = canScheduleExact(context);

        if (exact) {
            PendingIntent showIntent = PendingIntent.getActivity(
                context,
                id + 200_000,
                new Intent(context, MainActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            manager.setAlarmClock(new AlarmManager.AlarmClockInfo(triggerAt, showIntent), alarmIntent);
        } else {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, alarmIntent);
        }

        if (persist) {
            JSONObject item = new JSONObject();
            try {
                item.put("id", id);
                item.put("title", title);
                item.put("triggerAt", triggerAt);
                preferences(context).edit().putString(String.valueOf(id), item.toString()).apply();
            } catch (Exception ignored) {}
        }
        return exact;
    }

    static void cancel(Context context, int id) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        manager.cancel(PendingIntent.getBroadcast(
            context,
            id,
            new Intent(context, ReminderAlarmReceiver.class).setAction(ACTION),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        ));
        remove(context, id);
    }

    static void remove(Context context, int id) {
        preferences(context).edit().remove(String.valueOf(id)).apply();
    }

    static void rescheduleAll(Context context) {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, ?> entry : preferences(context).getAll().entrySet()) {
            try {
                JSONObject item = new JSONObject(String.valueOf(entry.getValue()));
                int id = item.getInt("id");
                long triggerAt = item.getLong("triggerAt");
                if (triggerAt > now) {
                    schedule(context, id, item.optString("title", "提醒"), triggerAt, false);
                } else {
                    remove(context, id);
                }
            } catch (Exception ignored) {}
        }
    }

    private static PendingIntent pendingIntent(Context context, int id, String title, long triggerAt) {
        Intent intent = new Intent(context, ReminderAlarmReceiver.class)
            .setAction(ACTION)
            .putExtra("reminder_id", id)
            .putExtra("title", title)
            .putExtra("trigger_at", triggerAt);
        return PendingIntent.getBroadcast(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(STORE, Context.MODE_PRIVATE);
    }
}
