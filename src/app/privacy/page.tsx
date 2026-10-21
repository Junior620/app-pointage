import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  robots: { index: true, follow: true },
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
              Politique de confidentialité
            </h1>
            <p className="mt-3 text-sm text-slate-500">
              Dernière mise à jour : {updatedAt}
            </p>
          </header>

          <div className="space-y-7 text-sm leading-6 text-slate-700 md:text-base md:leading-7">
            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                1. Objet
              </h2>
              <p className="mt-2">
                La présente politique de confidentialité explique comment
                l&apos;application Pointage RH collecte, utilise, conserve et
                protège les données personnelles des utilisateurs (employés,
                responsables RH, administrateurs et direction).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                2. Données collectées
              </h2>
              <p className="mt-2">Selon votre rôle, nous pouvons traiter :</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Données d&apos;identification : nom, prénom, matricule,
                  service, structure, rôle.
                </li>
                <li>
                  Coordonnées professionnelles : numéro WhatsApp, e-mail de
                  connexion.
                </li>
                <li>
                  Données de pointage : heures d&apos;arrivée/départ, statuts
                  (présent, absent, retard, mission, autorisation
                  d&apos;absence), commentaires.
                </li>
                <li>
                  Données de géolocalisation : position GPS associée aux
                  pointages (arrivée/départ) et distance au site de référence.
                </li>
                <li>
                  Données RH : demandes d&apos;autorisations d&apos;absence,
                  missions, heures
                  supplémentaires, validations/refus, date et motif de départ
                  (démission, fin de contrat, licenciement, abandon) le cas
                  échéant.
                </li>
                <li>
                  Journaux techniques et d&apos;audit : historique des actions,
                  traces de sécurité et de fonctionnement.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                3. Finalités du traitement
              </h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  Gérer la présence et la ponctualité des employés.
                </li>
                <li>
                  Gérer les workflows RH (autorisations d&apos;absence, missions,
                  heures
                  supplémentaires).
                </li>
                <li>
                  Envoyer des notifications opérationnelles via WhatsApp.
                </li>
                <li>
                  Produire des tableaux de bord, statistiques et rapports RH.
                </li>
                <li>
                  Assurer la sécurité, la traçabilité et la prévention de
                  fraude.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                4. Base légale
              </h2>
              <p className="mt-2">
                Les traitements sont réalisés pour l&apos;exécution de la relation
                de travail, l&apos;intérêt légitime de l&apos;entreprise
                (organisation, sécurité, prévention des abus), et le respect des
                obligations légales et sociales applicables.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                5. Partage des données
              </h2>
              <p className="mt-2">
                Les données sont accessibles uniquement aux personnes habilitées
                (RH, administration, direction et responsables autorises), ainsi
                qu&apos;aux prestataires techniques nécessaires au fonctionnement du
                service (hebergement, authentification, messagerie WhatsApp),
                dans la limite de leurs missions.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                6. Durée de conservation
              </h2>
              <p className="mt-2">
                Les données sont conservées pendant la durée nécessaire aux
                finalités de gestion RH, puis archivées ou supprimées selon les
                obligations légales, comptables, sociales et les politiques
                internes de conservation.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                7. Sécurité
              </h2>
              <p className="mt-2">
                Nous mettons en place des mesures techniques et organisationnelles
                raisonnables pour protéger les données : contrôle d&apos;accès,
                journalisation, segmentation des rôles, protection des secrets,
                supervision et sauvegardes.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                8. Vos droits
              </h2>
              <p className="mt-2">
                Vous pouvez, selon la réglementation applicable, demander
                l&apos;accès, la rectification, la limitation ou l&apos;opposition au
                traitement de vos données, ainsi que toute clarification sur leur
                usage.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
                9. Contact
              </h2>
              <p className="mt-2">
                Pour toute question relative à la confidentialité ou à vos
                données personnelles, contactez votre service RH ou
                l&apos;administrateur de l&apos;application.
              </p>
            </section>
          </div>

          <footer className="mt-10 border-t border-slate-100 pt-6">
            <Link
              href="/login"
              className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Retour à la connexion
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
