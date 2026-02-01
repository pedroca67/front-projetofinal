const express = require('express');
const axios = require('axios');
const session = require('express-session');
const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- 1. CONFIGURAÇÃO DA SESSÃO ---
app.use(session({
    secret: 'segredo-super-secreto',
    resave: false,
    saveUninitialized: true
}));

// --- 2. MIDDLEWARE DE PROTEÇÃO (LOGIN) ---
const verificarLogin = (req, res, next) => {
    if (req.session.usuario) {
        next();
    } else {
        res.redirect('/login');
    }
};

// --- 3. MIDDLEWARE DE PROTEÇÃO (SÓ ADMIN) ---
const verificarAdmin = (req, res, next) => {
    if (req.session.papel === 'ADMIN') {
        next();
    } else {
        // Se for funcionário tentando ver tela de admin, joga pro Dashboard
        res.redirect('/'); 
    }
};

// ==========================================================
// --- AUTENTICAÇÃO ---
// ==========================================================

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const resposta = await axios.post('http://localhost:8080/api/auth/login', {
            username: username,
            password: password
        });

        req.session.usuario = username;
        req.session.senha = password; 

        const papel = resposta.data.papel || 'FUNCIONARIO';
        req.session.papel = papel;

        res.redirect('/'); 

    } catch (erro) {
        console.error("ERRO NO LOGIN:", erro.message);
        res.render('login', { erro: "Usuário ou senha incorretos!" });
    }
});


app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ==========================================================
// --- DASHBOARD (AGORA PARA TODOS) ---
// ==========================================================

// --- ALTERAÇÃO 2: Removi 'verificarAdmin' daqui. Agora funcionários podem entrar. ---
app.get('/', verificarLogin, async (req, res) => {
    try {
        const resposta = await axios.get('http://localhost:8080/api/dashboard');
        
        res.render('dashboard', { 
            dados: resposta.data, 
            usuario: req.session.usuario,
            papel: req.session.papel,
            paginaAtual: 'dashboard'
        });
    } catch (erro) {
        // Se der erro (ex: backend fora), mostra zerado mas carrega a tela
        res.render('dashboard', { 
            dados: { totalClientes: 0, osAbertas: 0, faturamentoTotal: 0 }, 
            usuario: req.session.usuario,
            papel: req.session.papel,
            paginaAtual: 'dashboard',
            erro: "Erro de conexão" 
        });
    }
});

// ==========================================================
// --- CLIENTES (ACESSO GERAL) ---
// ==========================================================

app.get('/clientes', verificarLogin, async (req, res) => {
    try {
        const resposta = await axios.get('http://localhost:8080/api/clientes');
        res.render('lista', { 
            clientes: resposta.data, 
            usuario: req.session.usuario,
            papel: req.session.papel, 
            paginaAtual: 'clientes'
        });
    } catch (erro) {
        res.render('lista', { clientes: [], erro: "Erro", usuario: req.session.usuario, papel: req.session.papel, paginaAtual: 'clientes' });
    }
});

app.get('/cadastro', verificarLogin, (req, res) => {
    res.render('cadastro', { usuario: req.session.usuario, papel: req.session.papel, paginaAtual: 'clientes' });
});

app.post('/salvar', verificarLogin, async (req, res) => {
    try {
        await axios.post('http://localhost:8080/api/clientes', req.body);
        res.redirect('/clientes');
    } catch (erro) {
        res.send("Erro: " + erro.message);
    }
});

app.get('/editar/:id', verificarLogin, async (req, res) => {
    try {
        const resposta = await axios.get(`http://localhost:8080/api/clientes/${req.params.id}`);
        res.render('editar', { cliente: resposta.data, usuario: req.session.usuario, papel: req.session.papel, paginaAtual: 'clientes' });
    } catch (erro) {
        res.redirect('/clientes');
    }
});

app.post('/atualizar', verificarLogin, async (req, res) => {
    try {
        await axios.put(`http://localhost:8080/api/clientes/${req.body.id}`, req.body);
        res.redirect('/clientes');
    } catch (erro) {
        res.send("Erro: " + erro.message);
    }
});

app.get('/excluir/:id', verificarLogin, verificarAdmin, async (req, res) => {    try {
        await axios.delete(`http://localhost:8080/api/clientes/${req.params.id}`);
        res.redirect('/clientes');
    } catch (erro) {
        res.send("Erro: " + erro.message);
    }
});

// ==========================================================
// --- ORDENS DE SERVIÇO (ACESSO GERAL) ---
// ==========================================================

app.get('/os', verificarLogin, async (req, res) => {
    try {
        const resposta = await axios.get('http://localhost:8080/api/os');
        res.render('os_lista', { 
            listaOs: resposta.data, 
            usuario: req.session.usuario,
            papel: req.session.papel,
            paginaAtual: 'os'
        });
    } catch (erro) {
         res.render('os_lista', { listaOs: [], erro: "Erro", usuario: req.session.usuario, papel: req.session.papel, paginaAtual: 'os' });
    }
});

app.get('/os/nova', verificarLogin, async (req, res) => {
    try {
        const clientes = await axios.get('http://localhost:8080/api/clientes');
        res.render('os_cadastro', { 
            clientes: clientes.data, 
            usuario: req.session.usuario,
            papel: req.session.papel,
            paginaAtual: 'os'
        });
    } catch (erro) {
        res.redirect('/os');
    }
});

app.post('/os/salvar', verificarLogin, async (req, res) => {
    try {
        // Capturamos TODOS os campos novos que vêm do formulário (req.body)
        const novaOS = {
            descricao: req.body.descricao,
            valor: parseFloat(req.body.valor),
            cliente: { id: req.body.cliente_id },
            // CAMPOS NOVOS ABAIXO:
            marca: req.body.marca,
            modelo: req.body.modelo,
            imei: req.body.imei,
            senhaDispositivo: req.body.senha_dispositivo, // Note o nome igual ao do Java
            acessorios: req.body.acessorios
        };

        // Enviamos para o Java passando a autenticação da sessão para evitar erro 403
        await axios.post('http://localhost:8080/api/os', novaOS, {
            auth: {
                username: req.session.usuario,
                password: req.session.senha
            }
        }); 

        res.redirect('/os');
    } catch (erro) {
        console.error("Erro ao salvar OS:", erro.message);
        res.send("Erro ao salvar: " + erro.message);
    }
});

app.get('/os/finalizar/:id', verificarLogin, async (req, res) => {
    try {
        await axios.put(`http://localhost:8080/api/os/${req.params.id}/finalizar`);
        res.redirect('/os');
    } catch (erro) {
        res.send("Erro: " + erro.message);
    }
});

app.get('/os/cancelar/:id', verificarLogin, async (req, res) => {
    try {
        await axios.put(`http://localhost:8080/api/os/${req.params.id}/cancelar`);
        res.redirect('/os');
    } catch (erro) {
        res.send("Erro ao cancelar: " + erro.message);
    }
});

app.get('/os/excluir/:id', verificarLogin, verificarAdmin, async (req, res) => {    try {
        await axios.delete(`http://localhost:8080/api/os/${req.params.id}`);
        res.redirect('/os');
    } catch (erro) {
        res.send("Erro ao excluir: " + erro.message);
    }
});

// ==========================================================
// --- USUÁRIOS (SÓ ADMIN) ---
// ==========================================================

// MANTIDO 'verificarAdmin' AQUI PARA PROTEGER A CRIAÇÃO DE USUÁRIOS
app.get('/usuarios/novo', verificarLogin, verificarAdmin, (req, res) => {
    res.render('usuario_cadastro', { 
        usuario: req.session.usuario, 
        papel: req.session.papel,
        paginaAtual: 'admin'
    });
});

app.post('/usuarios/salvar', verificarLogin, verificarAdmin, async (req, res) => {
    try {
        await axios.post('http://localhost:8080/api/usuarios', req.body);
        res.redirect('/');
    } catch (erro) {
        res.send("Erro ao criar usuário: " + erro.message);
    }
});

app.get('/os/detalhes/:id', verificarLogin, async (req, res) => {
    try {
        const id = req.params.id;
        
        // Aqui está o "pulo do gato": Mandamos o usuário e senha 
        // que estão salvos na sessão do Node para o Java.
        const resposta = await axios.get(`http://localhost:8080/api/os/${id}`, {
            auth: {
                username: req.session.usuario,
                password: req.session.senha // Certifique-se de salvar a senha no login!
            }
        });

        res.render('os_detalhes', { 
            os: resposta.data, 
            usuario: req.session.usuario,
            papel: req.session.papel,
            paginaAtual: 'os'
        });
    }  catch (erro) {
    console.log("STATUS:", erro.response?.status);
    console.log("DATA:", erro.response?.data);

    res.send("Erro ao buscar OS. Veja o console.");
}

});

app.listen(port, () => {
    console.log(`Sistema rodando em http://localhost:${port}`);
});