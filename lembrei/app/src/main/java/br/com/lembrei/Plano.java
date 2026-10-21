package br.com.lembrei;

import android.app.AlarmManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Plano de avisos: o app (página) manda a lista dos próximos envios [{t, k, titulo, nome, fone, texto}] e o aparelho
 * agenda um alarme para o próximo. Na hora, mostra uma notificação; ao tocar, abre o WhatsApp com a conversa e o
 * texto prontos. Quem recebe vê a mensagem vindo do seu número, sem saber que foi lembrada por um app.
 */
final class Plano {

    private static final String PREFS = "plano";
    private static final String CANAL_SOM = "alarme";
    private static final String CANAL_VIBRA = "alarme_vibra";
    private static final long[] VIBRA = {0, 800, 400, 800, 400, 800, 400, 800};
    private static final long JANELA_MS = 12L * 3600 * 1000; // aviso atrasado (celular desligado) ainda aparece por 12h

    private Plano() { }

    static void salvar(Context c, String json) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("plano", json == null ? "[]" : json).putBoolean("renovarAvisado", false).apply();
        reagendar(c);
    }

    /** Plano enviado pelo app mais os avisos adiados (soneca), que sobrevivem a novas edições. */
    private static JSONArray itens(Context c) throws Exception {
        SharedPreferences sp = prefs(c);
        JSONArray p = new JSONArray(sp.getString("plano", "[]"));
        JSONArray a = new JSONArray(sp.getString("adiados", "[]"));
        for (int i = 0; i < a.length(); i++) p.put(a.get(i));
        return p;
    }

    /** Soneca: repete o mesmo aviso daqui a 10 minutos. */
    static void adiar(Context c, String k, String titulo, String nome, String fone, String texto) {
        try {
            SharedPreferences sp = prefs(c);
            JSONArray a = new JSONArray(sp.getString("adiados", "[]"));
            long agora = System.currentTimeMillis();
            JSONArray novos = new JSONArray();
            for (int i = 0; i < a.length(); i++) if (a.getJSONObject(i).getLong("t") > agora) novos.put(a.get(i));
            novos.put(new JSONObject().put("t", agora + 10 * 60 * 1000L).put("k", k + "#" + agora)
                    .put("titulo", titulo).put("nome", nome).put("fone", fone).put("texto", texto));
            sp.edit().putString("adiados", novos.toString()).apply();
        } catch (Exception ignorado) { }
        reagendar(c);
    }

    /** Agenda o alarme do próximo aviso que ainda está no futuro. */
    static void reagendar(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.cancel(intencao(c));
        long agora = System.currentTimeMillis(), melhor = Long.MAX_VALUE;
        try {
            JSONArray p = itens(c);
            for (int i = 0; i < p.length(); i++) {
                long t = p.getJSONObject(i).getLong("t");
                if (t > agora && t < melhor) melhor = t;
            }
        } catch (Exception ignorado) { }
        if (melhor == Long.MAX_VALUE) return;
        if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, melhor, intencao(c));
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, melhor, intencao(c));
        }
    }

    /** Chamado pelo alarme e ao ligar o celular: mostra o que já está na hora e agenda o seguinte. */
    static void disparar(Context c) {
        SharedPreferences sp = prefs(c);
        long agora = System.currentTimeMillis();
        try {
            JSONArray p = itens(c);
            JSONArray mostrados = new JSONArray(sp.getString("mostrados", "[]"));
            JSONArray novos = new JSONArray();
            boolean haFuturo = false;
            for (int i = 0; i < p.length(); i++) {
                JSONObject o = p.getJSONObject(i);
                long t = o.getLong("t");
                String k = o.getString("k");
                if (t > agora) { haFuturo = true; continue; }
                boolean jaFoi = contem(mostrados, k);
                if (!jaFoi && agora - t <= JANELA_MS) {
                    mostrar(c, k, o.getString("titulo"), o.getString("nome"), o.getString("fone"), o.getString("texto"));
                    jaFoi = true;
                }
                if (jaFoi) novos.put(k);
            }
            sp.edit().putString("mostrados", novos.toString()).apply();
            if (!haFuturo && p.length() > 0 && !sp.getBoolean("renovarAvisado", false)) {
                avisoSimples(c, 1, "Lembrei: renove os avisos", "Abra o app para programar os próximos dias.");
                sp.edit().putBoolean("renovarAvisado", true).apply();
            }
        } catch (Exception ignorado) { }
        reagendar(c);
    }

    /** Notificação imediata para conferir se está tudo funcionando. */
    static void testar(Context c, String nome, String fone) {
        mostrar(c, "teste" + System.currentTimeMillis(), "Teste do Lembrei!", nome, fone, "✅ Teste do Lembrei!");
    }

    /** "toca" (som + vibração, padrão) ou "vibra" (só vibração). */
    static void definirModo(Context c, String modo) {
        prefs(c).edit().putString("modo", "vibra".equals(modo) ? "vibra" : "toca").apply();
    }

    private static boolean soVibra(Context c) { return "vibra".equals(prefs(c).getString("modo", "toca")); }

    /** O som de um canal não muda depois de criado, por isso há um canal para cada modo. */
    private static String criarCanal(Context c, NotificationManager nm) {
        boolean vibra = soVibra(c);
        String id = vibra ? CANAL_VIBRA : CANAL_SOM;
        if (Build.VERSION.SDK_INT < 26) return id;
        NotificationChannel ch = new NotificationChannel(id, vibra ? "Alarme dos lembretes (só vibra)" : "Alarme dos lembretes", NotificationManager.IMPORTANCE_HIGH);
        if (vibra) {
            ch.setSound(null, null);
        } else {
            ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        }
        ch.enableVibration(true);
        ch.setVibrationPattern(VIBRA);
        ch.setBypassDnd(true);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
        return id;
    }

    private static Notification.Builder construtor(Context c, String canal) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, canal) : new Notification.Builder(c);
    }

    /** Alarme: toca e vibra até você tocar, com tela cheia por cima do bloqueio e botões de abrir/adiar. */
    private static void mostrar(Context c, String k, String titulo, String nome, String fone, String texto) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String canal = criarCanal(c, nm);
        int id = k.hashCode();
        int imut = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;

        Intent whats = new Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/" + fone + "?text=" + Uri.encode(texto)));
        PendingIntent abrir = PendingIntent.getActivity(c, id, whats, imut);

        Intent tela = new Intent(c, AlarmeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra("id", id).putExtra("k", k).putExtra("titulo", titulo).putExtra("nome", nome)
                .putExtra("fone", fone).putExtra("texto", texto);
        PendingIntent cheia = PendingIntent.getActivity(c, id, tela, imut);

        Intent soneca = new Intent(c, ReceptorLembrei.class).setAction("ADIAR").putExtra("id", id).putExtra("k", k)
                .putExtra("titulo", titulo).putExtra("nome", nome).putExtra("fone", fone).putExtra("texto", texto);
        PendingIntent adiar = PendingIntent.getBroadcast(c, id, soneca, imut);

        Notification.Builder b = construtor(c, canal);
        b.setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle("⏰ " + titulo)
                .setContentText("Mandar para " + nome + " — toque para abrir o WhatsApp")
                .setStyle(new Notification.BigTextStyle().bigText("Mandar para " + nome + ":\n" + texto))
                .setContentIntent(abrir)
                .setFullScreenIntent(cheia, true)
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_MAX)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .addAction(0, "Adiar 10 min", adiar);
        if (Build.VERSION.SDK_INT < 26) {
            if (!soVibra(c)) b.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), android.media.AudioManager.STREAM_ALARM);
            b.setVibrate(VIBRA);
        }
        Notification n = b.build();
        n.flags |= Notification.FLAG_INSISTENT; // repete o som até a notificação ser tocada ou dispensada
        nm.notify(id, n);
    }

    private static void avisoSimples(Context c, int id, String titulo, String texto) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String canal = criarCanal(c, nm);
        PendingIntent abrir = PendingIntent.getActivity(c, id, new Intent(c, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        nm.notify(id, construtor(c, canal).setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle(titulo)
                .setContentText(texto).setContentIntent(abrir).setAutoCancel(true).build());
    }

    private static boolean contem(JSONArray a, String k) throws Exception {
        for (int i = 0; i < a.length(); i++) if (k.equals(a.getString(i))) return true;
        return false;
    }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static PendingIntent intencao(Context c) {
        return PendingIntent.getBroadcast(c, 0, new Intent(c, ReceptorLembrei.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
