package com.shiguang.workbench;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class ReminderAlarmReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "shiguang_reminders_v1";

    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra("reminder_id", 0);
        String title = intent.getStringExtra("title");
        long triggerAt = intent.getLongExtra("trigger_at", System.currentTimeMillis());
        if (title == null || title.trim().isEmpty()) title = "到时间了";

        ensureChannel(context);
        ReminderScheduler.remove(context, id);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        Intent open = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("open_reminders", true);
        PendingIntent content = PendingIntent.getActivity(
            context,
            id + 100_000,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String time = new SimpleDateFormat("HH:mm", Locale.CHINA).format(new Date(triggerAt));
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_shiguang_notification)
            .setContentTitle("拾光提醒 · " + time)
            .setContentText(title)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(title))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(content)
            .build();
        context.getSystemService(NotificationManager.class).notify(id, notification);
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "拾光到点提醒",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("工作台创建的准时提醒");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 420, 240, 620 });
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM),
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        );
        manager.createNotificationChannel(channel);
    }
}
