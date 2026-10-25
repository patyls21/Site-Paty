package br.com.lembrei;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Tela de alarme: acende por cima do bloqueio com o aviso em letras grandes e os botões de ação. */
public class AlarmeActivity extends Activity {

    private TextView vTitulo, vNome, vTexto;
    private String titulo, nome, texto;
    private final BroadcastReceiver aoDestravar = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { atualizar(); }
    };

    /** Com o celular bloqueado mostra só "Lembrete"; nome e texto aparecem depois de desbloquear. */
    private void atualizar() {
        KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        boolean bloqueado = km != null && km.isKeyguardLocked();
        vTitulo.setText(bloqueado ? "Lembrete" : titulo);
        vNome.setText(bloqueado ? "Desbloqueie para ver os detalhes" : "Mandar para " + nome);
        vTexto.setText(bloqueado ? "" : texto);
    }

    @Override protected void onResume() { super.onResume(); registerReceiver(aoDestravar, new IntentFilter(Intent.ACTION_USER_PRESENT)); atualizar(); }

    @Override protected void onPause() { super.onPause(); try { unregisterReceiver(aoDestravar); } catch (IllegalArgumentException ignorado) { } }

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);

        final Intent d = getIntent();
        final int id = d.getIntExtra("id", 0);
        titulo = d.getStringExtra("titulo");
        nome = d.getStringExtra("nome");
        texto = d.getStringExtra("texto");
        final String fone = d.getStringExtra("fone");

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setBackgroundColor(Color.parseColor("#33033D"));
        int p = (int) (24 * getResources().getDisplayMetrics().density);
        raiz.setPadding(p, p, p, p);

        raiz.addView(texto("⏰", 64, "#F4C53D"));
        vTitulo = texto("", 28, "#FFFFFF");
        vNome = texto("", 18, "#E6D8EE");
        vTexto = texto("", 16, "#B3A6C2");
        raiz.addView(vTitulo);
        raiz.addView(vNome);
        raiz.addView(vTexto);

        raiz.addView(botao("Abrir WhatsApp e enviar", "#F4C53D", "#25122F", v -> {
            parar(id);
            Whats.abrir(this, fone, texto, false);
        }));
        raiz.addView(botao("Adiar 10 min", "#5A1A73", "#FFFFFF", v -> {
            parar(id);
            Plano.adiar(getApplicationContext(), d.getStringExtra("k"), d.getStringExtra("titulo"), nome, fone, texto);
            finish();
        }));
        raiz.addView(botao("Dispensar", "#2F2340", "#E6D8EE", v -> { parar(id); finish(); }));
        setContentView(raiz);
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
