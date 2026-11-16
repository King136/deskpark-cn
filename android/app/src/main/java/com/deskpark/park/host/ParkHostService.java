package com.deskpark.park.host;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * 主机保活：开房期间把自己变成前台服务，锁屏、切后台都不会把 WebView 挂起带走主机。
 * 服务本身不碰协议，房间逻辑仍在 JS 的 HostCore 里。
 */
public class ParkHostService extends Service {

    private static final String CHANNEL = "park-host";
    private static final int NOTICE_ID = 4301;

    @Override
    public void onCreate() {
        super.onCreate();
        startForeground(NOTICE_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTICE_ID, buildNotification());
        // 被系统回收后尝试重建（重建时端口若已被释放会重新监听）
        return START_STICKY;
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL, "局域网主机", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("闲亭在这台手机上开着房间");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        b.setContentTitle("闲亭 · 本机当主机")
                .setContentText("房间开在 8787 端口，朋友可以在局域网里加入")
                .setSmallIcon(android.R.drawable.ic_menu_share)
                .setOngoing(true)
                .setPriority(Notification.PRIORITY_LOW);
        return b.build();
    }

    @Override
    public void onDestroy() {
        HostRuntime.stop();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
