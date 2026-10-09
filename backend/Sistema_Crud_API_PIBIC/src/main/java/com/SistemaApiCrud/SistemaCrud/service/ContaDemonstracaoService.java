package com.SistemaApiCrud.SistemaCrud.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.SistemaApiCrud.SistemaCrud.dto.CadastroDemonstracaoRequestDTO;
import com.SistemaApiCrud.SistemaCrud.dto.ProfessorCadastroRequestDTO;
import com.SistemaApiCrud.SistemaCrud.dto.StatusDemonstracaoDTO;
import com.SistemaApiCrud.SistemaCrud.entity.Usuario;
import com.SistemaApiCrud.SistemaCrud.exception.BusinessException;
import com.SistemaApiCrud.SistemaCrud.exception.MuitasTentativasLoginException;
import com.SistemaApiCrud.SistemaCrud.exception.RecursoNaoEncontradoException;
import com.SistemaApiCrud.SistemaCrud.repository.UsuarioRepository;
import com.SistemaApiCrud.SistemaCrud.service.LoginAttemptStore.EstadoTentativaLogin;

/**
 * Autocadastro de professores para eventos de demonstracao. Fica desligado por padrao; as contas
 * criadas expiram, ficam limitadas a um total maximo e a uma quantidade de cadastros por IP.
 * O e-mail, em minusculas, vira o usuario de acesso.
 */
@Service
public class ContaDemonstracaoService {

    static final String TIPO_TENTATIVA = "DEMO_IP";
    private static final Duration JANELA_CADASTROS_POR_IP = Duration.ofHours(1);

    private final ProfessorService professorService;
    private final UsuarioRepository usuarioRepository;
    private final LoginAttemptStore tentativas;
    private final IdentificadorProtegido identificadorProtegido;
    private final TransactionTemplate transacao;
    private final boolean habilitado;
    private final Duration validade;
    private final long maximoContas;
    private final int maximoCadastrosPorIp;
    private final Clock relogio;

    @Autowired
    public ContaDemonstracaoService(
            ProfessorService professorService,
            UsuarioRepository usuarioRepository,
            LoginAttemptStore tentativas,
            IdentificadorProtegido identificadorProtegido,
            PlatformTransactionManager gerenciadorTransacao,
            @Value("${app.demo.cadastro.habilitado:false}") boolean habilitado,
            @Value("${app.demo.cadastro.validade:3d}") Duration validade,
            @Value("${app.demo.cadastro.maximo-contas:100}") long maximoContas,
            @Value("${app.demo.cadastro.maximo-cadastros-por-ip:0}") int maximoCadastrosPorIp) {
        this(professorService, usuarioRepository, tentativas, identificadorProtegido,
                new TransactionTemplate(gerenciadorTransacao), habilitado, validade, maximoContas,
                maximoCadastrosPorIp, Clock.systemUTC());
    }

    ContaDemonstracaoService(
            ProfessorService professorService,
            UsuarioRepository usuarioRepository,
            LoginAttemptStore tentativas,
            IdentificadorProtegido identificadorProtegido,
            TransactionTemplate transacao,
            boolean habilitado,
            Duration validade,
            long maximoContas,
            int maximoCadastrosPorIp,
            Clock relogio) {
        if (validade.isNegative() || validade.isZero() || maximoContas < 1 || maximoCadastrosPorIp < 0) {
            throw new IllegalStateException("Limites do cadastro de demonstracao devem ser positivos");
        }
        this.professorService = professorService;
        this.usuarioRepository = usuarioRepository;
        this.tentativas = tentativas;
        this.identificadorProtegido = identificadorProtegido;
        this.transacao = transacao;
        this.habilitado = habilitado;
        this.validade = validade;
        this.maximoContas = maximoContas;
        this.maximoCadastrosPorIp = maximoCadastrosPorIp;
        this.relogio = relogio;
    }

    public StatusDemonstracaoDTO status() {
        return new StatusDemonstracaoDTO(habilitado, habilitado ? validade.toHours() : 0);
    }

    /**
     * Cada tentativa conta para o limite por IP antes da criacao, fora da transacao dela, para que
     * um erro de negocio nao desfaca o registro.
     *
     * @return o usuario de acesso criado, que e o e-mail normalizado
     */
    public String cadastrar(CadastroDemonstracaoRequestDTO dto, String enderecoRemoto) {
        if (!habilitado) {
            throw new RecursoNaoEncontradoException("Cadastro de demonstracao indisponivel");
        }
        Instant agora = relogio.instant();
        // Zero desliga o limite por IP: atras do tunel do Cloudflare todos chegam com o mesmo endereco.
        if (maximoCadastrosPorIp > 0) {
            String ipHash = identificadorProtegido.gerar(TIPO_TENTATIVA, normalizarIp(enderecoRemoto));
            validarSemBloqueio(ipHash, agora);
            tentativas.registrarFalha(TIPO_TENTATIVA, ipHash, agora, agora.minus(JANELA_CADASTROS_POR_IP),
                    agora.plus(JANELA_CADASTROS_POR_IP), maximoCadastrosPorIp);
        }

        String username = normalizarEmail(dto.getEmail());
        transacao.executeWithoutResult(status -> criarConta(dto, username, agora));
        return username;
    }

    /**
     * Contas criadas por este cadastro usam o e-mail em minusculas como usuario de acesso.
     */
    public static String normalizarEmail(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }

    private void criarConta(CadastroDemonstracaoRequestDTO dto, String username, Instant agora) {
        if (usuarioRepository.countByContaDemonstracaoTrue() >= maximoContas) {
            throw new BusinessException(
                    "O limite de contas de demonstracao foi atingido. Procure a equipe do evento");
        }
        if (usuarioRepository.existsByUsername(username)) {
            throw new BusinessException("Ja existe uma conta cadastrada com esse e-mail");
        }

        professorService.cadastrarPublico(new ProfessorCadastroRequestDTO(
                dto.getNome().strip() + " " + dto.getSobrenome().strip(),
                username,
                dto.getAreaAtuacao().strip(),
                username,
                dto.getSenha()));

        Usuario usuario = usuarioRepository.findByUsername(username)
                .orElseThrow(() -> new IllegalStateException("Conta de demonstracao nao foi persistida"));
        usuario.setContaDemonstracao(true);
        usuario.setDemonstracaoExpiraEm(agora.plus(validade));
        usuario.getProfessor().setCargo(dto.getCargo().strip());
        usuarioRepository.save(usuario);
    }

    private void validarSemBloqueio(String ipHash, Instant agora) {
        EstadoTentativaLogin estado = tentativas.buscar(TIPO_TENTATIVA, ipHash).orElse(null);
        if (estado != null && estado.bloqueadoAte() != null && estado.bloqueadoAte().isAfter(agora)) {
            throw new MuitasTentativasLoginException(
                    "Muitos cadastros feitos a partir desta rede. Tente novamente mais tarde",
                    Math.max(1, Duration.between(agora, estado.bloqueadoAte()).toSeconds()));
        }
    }

    private static String normalizarIp(String enderecoRemoto) {
        return enderecoRemoto == null || enderecoRemoto.isBlank() ? "<desconhecido>" : enderecoRemoto.strip();
    }
}
