package br.com.lembrei;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Recebe o alarme do próximo aviso e a reinicialização do aparelho. */
public class ReceptorLembrei extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Plano.disparar(c);
    }
}
