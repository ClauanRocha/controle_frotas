// Importações necessárias
const https = require('https');
const fs = require('fs');
const mysql = require('mysql');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');

// Criar a instância do Express
const app = express(); // Corrigido: criação da instância do app

// Configuração do body-parser para processar dados do formulário
app.use(bodyParser.urlencoded({ extended: true })); 
app.use(bodyParser.json());

// Configuração do EJS
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Configuração do banco de dados MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'controle_frota'
});

// Conectar ao banco de dados
db.connect((err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
    } else {
        console.log('Conectado ao banco de dados MySQL');
    }
});

// Configuração de sessão
app.use(session({
    secret: 'seu-segredo-aqui',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true } // 'true' para HTTPS
}));

// Definindo as rotas e passando o objeto `db` para o módulo de rotas
app.use('/', require('./routes/index')(db));

// Configurando o armazenamento do multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Define o diretório onde os arquivos serão armazenados
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Define o nome do arquivo
    }
});

// Criando a constante upload usando a configuração do storage
const upload = multer({ storage: storage });

// Certificados SSL
const options = {
    key: fs.readFileSync('D:/Controle Frota/server.key'),
    cert: fs.readFileSync('D:/Controle Frota/star_autoamerica_com_br.crt'),
    ca: [
        fs.readFileSync('D:/Controle Frota/My_CA_Bundle.crt'),
        fs.readFileSync('D:/Controle Frota/DigiCertCA.crt')
    ]
};

// Iniciar o servidor HTTPS
const PORT = process.env.PORT || 3131;
https.createServer(options, app).listen(PORT, () => {
    console.log(`Servidor HTTPS rodando na porta ${PORT}`);
});

app.get('/dados-graficos', (req, res) => {
    const veiculo = req.query.veiculo; // Recebe o veículo selecionado como parâmetro
    let sql;

    if (veiculo === 'all') {
        // Consulta para todos os veículos
        sql = 'SELECT modelo, ano, placa FROM veiculos';
    } else {
        // Consulta filtrada por veículo
        sql = 'SELECT modelo, ano, placa FROM veiculos WHERE modelo = ?';
    }

    db.query(sql, [veiculo], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar dados' });
        }

        res.json(result); // Retorna os dados em formato JSON
    });
});

app.get('/veiculos', (req, res) => {
    const sql = 'SELECT modelo FROM veiculos';
    db.query(sql, (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao buscar veículos' });
        }
        res.json(result); // Retorna os modelos dos veículos
    });
});

// Rota para a página /frota
app.get('/frota', (req, res) => {
    // Supondo que você tenha uma conexão com o banco de dados e a tabela `veiculos`
    db.query('SELECT * FROM veiculos', (error, results) => {
        if (error) {
            console.error('Erro ao buscar veículos:', error);
            return res.status(500).send('Erro no servidor');
        }

        // Renderiza a view e passa a lista de veículos
        res.render('frota', { user: req.user, veiculos: results });
    });
});
