package br.com.nossocontrole.lancar;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Recebe o alarme diário (e a reinicialização do aparelho) e mostra/reagenda o aviso da fatura. */
public class ReceptorAviso extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(i.getAction())) {
            AvisosFatura.reagendar(c);
            return;
        }
        String dia = i.getStringExtra("dia");
        if (dia != null && !dia.isEmpty()) AvisosFatura.disparar(c, dia); else AvisosFatura.reagendar(c);
    }
}
