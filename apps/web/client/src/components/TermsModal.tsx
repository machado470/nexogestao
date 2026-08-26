import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

import { Dialog, DialogContent } from "./ui/dialog";

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "terms" | "privacy";
}

export function TermsModal({ isOpen, onClose, type }: TermsModalProps) {
  const isTerms = type === "terms";

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl overflow-hidden border-[var(--border-subtle)] bg-white p-0 shadow-sm dark:bg-gray-800">
        <div className="flex max-h-[90vh] flex-col">
          {/* Header */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {isTerms ? "Termos de Serviço" : "Política de Privacidade"}
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 space-y-6 overflow-y-auto p-6 text-gray-700 dark:text-gray-300">
            {isTerms ? (
              <>
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    1. Aceitação dos Termos
                  </h3>
                  <p>
                    Ao acessar e usar o NexoGestão, você concorda em cumprir
                    estes termos de serviço e todas as leis e regulamentos
                    aplicáveis. Se você não concordar com algum desses termos, é
                    proibido usar ou acessar este site.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    2. Licença de Uso
                  </h3>
                  <p>
                    É concedida a você uma licença limitada, não exclusiva e
                    revogável para usar o NexoGestão para fins pessoais e
                    comerciais legítimos. Esta licença não inclui o direito de:
                  </p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Modificar ou copiar os materiais</li>
                    <li>
                      Usar os materiais para fins comerciais ou de publicidade
                    </li>
                    <li>
                      Tentar descompilar ou fazer engenharia reversa de qualquer
                      software contido no NexoGestão
                    </li>
                    <li>
                      Remover quaisquer direitos autorais ou outras notações de
                      propriedade
                    </li>
                    <li>
                      Transferir os materiais para outra pessoa ou "espelhar" os
                      materiais em qualquer outro servidor
                    </li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    3. Isenção de Responsabilidade
                  </h3>
                  <p>
                    Os materiais no NexoGestão são fornecidos "como estão". O
                    NexoGestão não oferece garantias, expressas ou implícitas, e
                    nega expressamente todas as outras garantias, incluindo, sem
                    limitação, garantias implícitas ou condições de
                    comercialização, adequação a um propósito específico ou não
                    violação de propriedade intelectual ou outro direito.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    4. Limitações de Responsabilidade
                  </h3>
                  <p>
                    Em nenhum caso o NexoGestão ou seus fornecedores serão
                    responsáveis por quaisquer danos (incluindo, sem limitação,
                    danos por perda de dados ou lucro ou devido a interrupção de
                    negócios) decorrentes do uso ou da incapacidade de usar os
                    materiais no NexoGestão.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    5. Precisão dos Materiais
                  </h3>
                  <p>
                    Os materiais que aparecem no NexoGestão podem incluir erros
                    técnicos, tipográficos ou fotográficos. O NexoGestão não
                    garante que qualquer material em seu site seja preciso,
                    completo ou atual.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    6. Modificações
                  </h3>
                  <p>
                    O NexoGestão pode revisar estes termos de serviço do site a
                    qualquer momento sem aviso prévio. Ao usar este site, você
                    concorda em estar vinculado pela versão atual desses termos
                    de serviço.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    7. Lei Aplicável
                  </h3>
                  <p>
                    Estes termos e condições são regidos e interpretados de
                    acordo com as leis do Brasil, e você se submete
                    irrevogavelmente à jurisdição exclusiva dos tribunais
                    localizados neste estado ou localidade.
                  </p>
                </section>
              </>
            ) : (
              <>
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    1. Informações que Coletamos
                  </h3>
                  <p>
                    Coletamos informações que você nos fornece diretamente, como
                    quando você cria uma conta, faz login ou entra em contato
                    conosco. Isso pode incluir seu nome, endereço de email,
                    número de telefone e outras informações de contato.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    2. Como Usamos Suas Informações
                  </h3>
                  <p>Usamos as informações que coletamos para:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Fornecer, manter e melhorar nossos serviços</li>
                    <li>Processar suas transações</li>
                    <li>
                      Enviar comunicações técnicas e atualizações de segurança
                    </li>
                    <li>
                      Responder às suas consultas e fornecer suporte ao cliente
                    </li>
                    <li>Cumprir obrigações legais</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    3. Proteção de Dados
                  </h3>
                  <p>
                    Implementamos medidas de segurança apropriadas para proteger
                    suas informações pessoais contra acesso não autorizado,
                    alteração, divulgação ou destruição. No entanto, nenhum
                    método de transmissão pela Internet ou armazenamento
                    eletrônico é 100% seguro.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    4. Compartilhamento de Informações
                  </h3>
                  <p>
                    Não compartilhamos suas informações pessoais com terceiros,
                    exceto conforme necessário para fornecer nossos serviços ou
                    conforme exigido por lei.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    5. Cookies
                  </h3>
                  <p>
                    Usamos cookies e tecnologias semelhantes para rastrear a
                    atividade em nosso site e manter certas informações. Você
                    pode desabilitar cookies através das configurações do seu
                    navegador.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    6. Seus Direitos
                  </h3>
                  <p>
                    Você tem o direito de acessar, corrigir ou excluir suas
                    informações pessoais. Para fazer isso, entre em contato
                    conosco através dos dados fornecidos no site.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    7. Alterações nesta Política
                  </h3>
                  <p>
                    Podemos atualizar esta política de privacidade
                    periodicamente. Notificaremos você sobre alterações
                    significativas publicando a política atualizada no site.
                  </p>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    8. Contato
                  </h3>
                  <p>
                    Se tiver dúvidas sobre esta política de privacidade, entre
                    em contato conosco através do email: privacy@nexogestao.com
                  </p>
                </section>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-shrink-0 gap-3 border-t border-gray-200 p-6 dark:border-gray-700">
            <Button onClick={onClose} variant="outline" className="flex-1">
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
