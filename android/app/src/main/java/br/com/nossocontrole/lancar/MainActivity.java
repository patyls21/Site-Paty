package br.com.nossocontrole.lancar;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Casca do formulário "Lançar gasto": mostra o mesmo site dentro de um WebView e recebe
 * comprovantes (imagem/PDF) do Compartilhar do banco, entregando o arquivo para a página.
 */
public class MainActivity extends Activity {

    private static final String SITE = "https://patyls21.github.io/Site-Paty/formulario.html";
    private static final int PEDIDO_ARQUIVO = 7;
    private static final int LIMITE_BYTES = 15 * 1024 * 1024;
    private static final int PEDACO = 150000; // caracteres base64 por chamada ao JavaScript

    private WebView web;
    private ValueCallback<Uri[]> seletor;
    private boolean paginaPronta = false;
    private final List<Uri> fila = new ArrayList<>();

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        web = new WebView(this);
        setContentView(web);

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);     // guarda o login (localStorage)
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String host = u.getHost() == null ? "" : u.getHost();
                if (host.equals("patyls21.github.io") || host.endsWith(".supabase.co")) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u)); // links externos abrem no navegador
                } catch (ActivityNotFoundException ignorado) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (!paginaPronta) {
                    paginaPronta = true;
                    for (Uri u : fila) entregar(u);
                    fila.clear();
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // botões "Escolher arquivo" do site (anexar comprovante)
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (seletor != null) seletor.onReceiveValue(null);
                seletor = callback;
                try {
                    startActivityForResult(params.createIntent(), PEDIDO_ARQUIVO);
                } catch (Exception e) {
                    seletor = null;
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new PonteAvisos(), "NCAndroid");

        web.loadUrl(SITE);
        tratarIntent(getIntent());
    }

    // ---------- avisos da fatura: o site entrega o plano, o aparelho agenda as notificações ----------

    private class PonteAvisos {
        @JavascriptInterface
        public void agendar(final String planoJson) {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33
                        && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 9);
                }
                AvisosFatura.salvar(MainActivity.this, planoJson);
            });
        }

        @JavascriptInterface
        public void cancelar() {
            AvisosFatura.salvar(MainActivity.this, "[]");
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        tratarIntent(intent);
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        super.onActivityResult(pedido, resultado, dados);
        if (pedido == PEDIDO_ARQUIVO && seletor != null) {
            seletor.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado, dados));
            seletor = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    // ---------- comprovante vindo do Compartilhar ----------

    @SuppressWarnings("deprecation")
    private void tratarIntent(Intent i) {
        if (i == null || i.getAction() == null) return;
        Uri u = null;
        if (Intent.ACTION_SEND.equals(i.getAction())) {
            u = i.getParcelableExtra(Intent.EXTRA_STREAM);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(i.getAction())) {
            ArrayList<Uri> lista = i.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (lista != null && !lista.isEmpty()) u = lista.get(0);
        }
        if (u == null) return;
        if (paginaPronta) entregar(u); else fila.add(u);
    }

    /** Lê o arquivo fora da tela principal e manda para a página em pedaços. */
    private void entregar(final Uri uri) {
        new Thread(() -> {
            try {
                ContentResolver cr = getContentResolver();
                String tipo = cr.getType(uri);
                if (tipo == null) tipo = "application/octet-stream";
                final String nome = nomeDe(uri), tipoFinal = tipo;

                ByteArrayOutputStream saida = new ByteArrayOutputStream();
                try (InputStream in = cr.openInputStream(uri)) {
                    if (in == null) throw new IOException("não consegui abrir o arquivo");
                    byte[] buf = new byte[16384];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        saida.write(buf, 0, n);
                        if (saida.size() > LIMITE_BYTES) throw new IOException("arquivo muito grande");
                    }
                }
                final String b64 = Base64.encodeToString(saida.toByteArray(), Base64.NO_WRAP);

                web.post(() -> js("NCNativo.inicio(" + JSONObject.quote(nome) + "," + JSONObject.quote(tipoFinal) + ")"));
                for (int i = 0; i < b64.length(); i += PEDACO) {
                    final String parte = b64.substring(i, Math.min(b64.length(), i + PEDACO));
                    web.post(() -> js("NCNativo.parte('" + parte + "')"));
                }
                web.post(() -> js("NCNativo.fim()"));
            } catch (final Exception e) {
                web.post(() -> js("NCNativo.erro(" + JSONObject.quote(String.valueOf(e.getMessage())) + ")"));
            }
        }).start();
    }

    private void js(String codigo) {
        web.evaluateJavascript("window.NCNativo && " + codigo, null);
    }

    private String nomeDe(Uri uri) {
        try (Cursor c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String n = c.getString(0);
                if (n != null && !n.isEmpty()) return n;
            }
        } catch (Exception ignorado) { }
        String ultimo = uri.getLastPathSegment();
        return ultimo != null ? ultimo : "comprovante";
    }
}
