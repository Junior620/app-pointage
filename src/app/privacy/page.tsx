import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politique de confidentialité | Pointage RH",
  description:
    "Politique de confidentialité de Pointage RH : données collectées, finalités, conservation et droits des utilisateurs.",
};

const updatedAt = "03 avril 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-4xl px-6 py-12 md:py-16">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-10">
          <header className="mb-8 border-b border-slate-100 pb-6">
            <p className="text-sm font-medium text-blue-700">Pointage RH</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
              Politique de confidentialite
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              Derniere mise a jour : {updatedAt}
            </p>
          </header>

          <div className="space-y-7 text-sm leading-6 text-slate-700 md:text-base md:leading-7">
            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                1. Objet
              </h2>
              <p className="mt-2">
                La presente politique de confidentialite explique comment
                l&apos;application Pointage RH collecte, utilise, conserve et
                protege les donnees personnelles des utilisateurs (employes,
                responsables RH, administrateurs et direction).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                2. Donnees collectees
              </h2>
              <p className="mt-2">Selon votre role, nous pouvons traiter :</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Donnees d&apos;identification : nom, prenom, matricule,
                  service, structure, role.
                </li>
                <li>
                  Coordonnees professionnelles : numero WhatsApp, e-mail de
                  connexion.
                </li>
                <li>
                  Donnees de pointage : heures d&apos;arrivee/depart, statuts
                  (present, absent, retard, mission, autorisation
                  d&apos;absence), commentaires.
                </li>
                <li>
                  Donnees de geolocalisation : position GPS associee aux
                  pointages (arrivee/depart) et distance au site de reference.
                </li>
                <li>
                  Donnees RH : demandes d&apos;autorisations d&apos;absence,
                  missions, heures
                  supplementaires, validations/refus, date et motif de depart
                  (demission, fin de contrat, licenciement, abandon) le cas
                  echeant.
                </li>
                <li>
                  Journaux techniques et d&apos;audit : historique des actions,
                  traces de securite et de fonctionnement.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                3. Finalites du traitement
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Gerer la presence et la ponctualite des employes.
                </li>
                <li>
                  Gerer les workflows RH (autorisations d&apos;absence, missions,
                  heures
                  supplementaires).
                </li>
                <li>
                  Envoyer des notifications operationnelles via WhatsApp.
                </li>
                <li>
                  Produire des tableaux de bord, statistiques et rapports RH.
                </li>
                <li>
                  Assurer la securite, la tracabilite et la prevention de
                  fraude.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                4. Base legale
              </h2>
              <p className="mt-2">
                Les traitements sont realises pour l&apos;execution de la relation
                de travail, l&apos;interet legitime de l&apos;entreprise
                (organisation, securite, prevention des abus), et le respect des
                obligations legales et sociales applicables.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                5. Partage des donnees
              </h2>
              <p className="mt-2">
                Les donnees sont accessibles uniquement aux personnes habilitees
                (RH, administration, direction et responsables autorises), ainsi
                qu&apos;aux prestataires techniques necessaires au fonctionnement du
                service (hebergement, authentification, messagerie WhatsApp),
                dans la limite de leurs missions.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                6. Duree de conservation
              </h2>
              <p className="mt-2">
                Les donnees sont conservees pendant la duree necessaire aux
                finalites de gestion RH, puis archivees ou supprimees selon les
                obligations legales, comptables, sociales et les politiques
                internes de conservation.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                7. Securite
              </h2>
              <p className="mt-2">
                Nous mettons en place des mesures techniques et organisationnelles
                raisonnables pour proteger les donnees : controle d&apos;acces,
                journalisation, segmentation des roles, protection des secrets,
                supervision et sauvegardes.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                8. Vos droits
              </h2>
              <p className="mt-2">
                Vous pouvez, selon la reglementation applicable, demander
                l&apos;acces, la rectification, la limitation ou l&apos;opposition au
                traitement de vos donnees, ainsi que toute clarification sur leur
                usage.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                9. Contact
              </h2>
              <p className="mt-2">
                Pour toute question relative a la confidentialite ou a vos
                donnees personnelles, contactez votre service RH ou
                l&apos;administrateur de l&apos;application.
              </p>
            </section>
          </div>

          <footer className="mt-10 border-t border-slate-100 pt-6">
            <Link
              href="/login"
              className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Retour a la connexion
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
