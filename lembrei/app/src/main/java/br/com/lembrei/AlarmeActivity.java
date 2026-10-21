package br.com.lembrei;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.ActivityNotFoundException;
import android.os.Build;
import android.widget.Toast;
import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Tela de alarme: acende por cima do bloqueio com o aviso em letras grandes e os botões de ação. */
public class AlarmeActivity extends Activity {

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);

        final Intent d = getIntent();
        final int id = d.getIntExtra("id", 0);
        final String nome = d.getStringExtra("nome"), fone = d.getStringExtra("fone"), texto = d.getStringExtra("texto");

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setBackgroundColor(Color.parseColor("#33033D"));
        int p = (int) (24 * getResources().getDisplayMetrics().density);
        raiz.setPadding(p, p, p, p);

        raiz.addView(texto("⏰", 64, "#F4C53D"));
        raiz.addView(texto(d.getStringExtra("titulo"), 28, "#FFFFFF"));
        raiz.addView(texto("Mandar para " + nome, 18, "#E6D8EE"));
        raiz.addView(texto(texto, 16, "#B3A6C2"));

        raiz.addView(botao("Abrir WhatsApp e enviar", "#F4C53D", "#25122F", v -> {
            parar(id);
            abrirWhats(fone, texto);
        }));
        raiz.addView(botao("Adiar 10 min", "#5A1A73", "#FFFFFF", v -> {
            parar(id);
            Plano.adiar(getApplicationContext(), d.getStringExtra("k"), d.getStringExtra("titulo"), nome, fone, texto);
            finish();
        }));
        raiz.addView(botao("Dispensar", "#2F2340", "#E6D8EE", v -> { parar(id); finish(); }));
        setContentView(raiz);
    }

    /** Pede para destravar a tela (se estiver bloqueada) e só então abre o WhatsApp na conversa. */
    private void abrirWhats(final String fone, final String texto) {
        final Runnable abrir = () -> {
            Uri u = Uri.parse("https://wa.me/" + fone + "?text=" + Uri.encode(texto));
            for (String pacote : new String[]{"com.whatsapp", "com.whatsapp.w4b", null}) {
                Intent i = new Intent(Intent.ACTION_VIEW, u).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (pacote != null) i.setPackage(pacote);
                try {
                    startActivity(i);
                    finish();
                    return;
                } catch (ActivityNotFoundException | SecurityException ignorado) { }
            }
            Toast.makeText(this, "Não consegui abrir o WhatsApp.", Toast.LENGTH_LONG).show();
        };
        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && km != null && km.isKeyguardLocked()) {
            km.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                @Override public void onDismissSucceeded() { abrir.run(); }
                @Override public void onDismissError() { Toast.makeText(AlarmeActivity.this, "Desbloqueie o celular e toque de novo.", Toast.LENGTH_LONG).show(); }
            });
        } else {
            abrir.run();
        }
    }

    private void parar(int id) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(id); // cancelar a notificação também silencia o som
    }

    private TextView texto(String t, int sp, String cor) {
        TextView v = new TextView(this);
        v.setText(t);
        v.setTextSize(sp);
        v.setTextColor(Color.parseColor(cor));
        v.setGravity(Gravity.CENTER);
        v.setPadding(0, 12, 0, 12);
        return v;
    }

    private Button botao(String t, String fundo, String cor, View.OnClickListener o) {
        Button b = new Button(this);
        b.setText(t);
        b.setAllCaps(false);
        b.setTextSize(18);
        b.setTextColor(Color.parseColor(cor));
        b.setBackgroundColor(Color.parseColor(fundo));
        b.setOnClickListener(o);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (int) (56 * getResources().getDisplayMetrics().density));
        lp.topMargin = (int) (14 * getResources().getDisplayMetrics().density);
        b.setLayoutParams(lp);
        return b;
    }
}
