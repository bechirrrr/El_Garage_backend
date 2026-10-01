import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityCategory, Role } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateDiagnosticTestDto } from './dto/create-diagnostic-test.dto.js';
import type { CreateSymptomDto } from './dto/create-symptom.dto.js';
import type { UpdateDiagnosticTestDto } from './dto/update-diagnostic-test.dto.js';
import type { UpdateSymptomDto } from './dto/update-symptom.dto.js';
import type { UpsertDiagnosisDto } from './dto/upsert-diagnosis.dto.js';

@Injectable()
export class DiagnosisService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifie que le WorkOrder parent existe bien DANS ce garage, et que
   * l'utilisateur a le droit d'en editer le contenu technique (Section 20 :
   * Admin/Front Desk toujours, Mecanicien seulement s'il a cree CE ticket).
   * Meme regle que WorkOrdersService.assertCanEdit -- dupliquee ici
   * volontairement (3 lignes) plutot que de coupler les deux modules pour
   * si peu.
   */
  private async getEditableWorkOrder(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
  ) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder || workOrder.garageId !== garageId) {
      throw new NotFoundException('Ticket introuvable.');
    }
    if (userRole === Role.MECHANIC && workOrder.createdById !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que les tickets que vous avez crees.');
    }
    return workOrder;
  }

  /**
   * Lecture seule : tous les roles garage-scoped peuvent VOIR le diagnostic
   * (meme regle de visibilite que le WorkOrder lui-meme, Section 20), donc
   * pas de restriction d'ownership ici -- juste verifier que le ticket
   * appartient au garage.
   */
  async findByWorkOrder(garageId: string, workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({ where: { id: workOrderId } });
    if (!workOrder || workOrder.garageId !== garageId) {
      throw new NotFoundException('Ticket introuvable.');
    }

    // Pas de 404 si le diagnostic n'existe pas encore : un ticket fraichement
    // RECEIVED n'a legitimement aucun diagnostic. null est une reponse
    // valide, pas une erreur.
    return this.prisma.diagnosis.findUnique({
      where: { workOrderId },
      include: {
        symptoms: { orderBy: { id: 'asc' } },
        diagnosticTests: { orderBy: { id: 'asc' } },
      },
    });
  }

  /**
   * upsert plutot que create/update separes : Diagnosis est en 1-1 avec
   * WorkOrder (workOrderId @unique), donc "il n'existe pas encore" et "il
   * existe deja" se traitent par la meme operation Prisma. Le message
   * d'ActivityEvent distingue les deux cas ("demarre" vs "mis a jour"),
   * comme l'exemple de la Section 17 ("10:05 Diagnosis started" / "10:47
   * Diagnosis updated").
   */
  async upsert(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
    dto: UpsertDiagnosisDto,
  ) {
    const workOrder = await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);

    const existing = await this.prisma.diagnosis.findUnique({ where: { workOrderId } });

    // La plainte du client est saisie UNE SEULE FOIS, a l'ouverture du
    // ticket (WorkOrder.problemReported) -- le Mecanicien ne la re-saisit
    // pas au moment du diagnostic. On la derive donc ici cote serveur
    // plutot que de compter sur le frontend pour la reenvoyer a chaque
    // upsert ; dto.customerComplaint reste un override explicite possible
    // (ex. reformulation), jamais redemande par defaut.
    const data = { ...dto, customerComplaint: dto.customerComplaint ?? workOrder.problemReported };

    return this.prisma.$transaction(async (tx) => {
      const diagnosis = await tx.diagnosis.upsert({
        where: { workOrderId },
        create: { garageId, workOrderId, ...data },
        update: data,
      });

      await tx.activityEvent.create({
        data: {
          garageId,
          workOrderId,
          actorId: userId,
          type: existing ? 'DIAGNOSIS_UPDATED' : 'DIAGNOSIS_STARTED',
          category: ActivityCategory.GENERAL,
          message: existing ? 'Diagnostic mis a jour' : 'Diagnostic demarre',
        },
      });

      return diagnosis;
    });
  }

  /**
   * Prerequis commun aux checklists (Symptom/DiagnosticTest) : un Diagnosis
   * doit deja exister pour ce ticket -- on n'ajoute pas un symptome "dans le
   * vide" avant que le Mecanicien ait au moins ouvert le diagnostic.
   */
  private async getEditableDiagnosis(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
  ) {
    await this.getEditableWorkOrder(garageId, userId, userRole, workOrderId);

    const diagnosis = await this.prisma.diagnosis.findUnique({ where: { workOrderId } });
    if (!diagnosis) {
      throw new NotFoundException(
        "Aucun diagnostic pour ce ticket -- creez-le d'abord (PUT .../diagnosis).",
      );
    }
    return diagnosis;
  }

  // --- Symptoms -------------------------------------------------------

  async addSymptom(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
    dto: CreateSymptomDto,
  ) {
    const diagnosis = await this.getEditableDiagnosis(garageId, userId, userRole, workOrderId);
    return this.prisma.symptom.create({ data: { diagnosisId: diagnosis.id, label: dto.label } });
  }

  async updateSymptom(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
    symptomId: string,
    dto: UpdateSymptomDto,
  ) {
    const diagnosis = await this.getEditableDiagnosis(garageId, userId, userRole, workOrderId);
    const symptom = await this.prisma.symptom.findUnique({ where: { id: symptomId } });
    if (!symptom || symptom.diagnosisId !== diagnosis.id) {
      throw new NotFoundException('Symptome introuvable.');
    }
    return this.prisma.symptom.update({ where: { id: symptomId }, data: dto });
  }

  async removeSymptom(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
    symptomId: string,
  ) {
    const diagnosis = await this.getEditableDiagnosis(garageId, userId, userRole, workOrderId);
    const symptom = await this.prisma.symptom.findUnique({ where: { id: symptomId } });
    if (!symptom || symptom.diagnosisId !== diagnosis.id) {
      throw new NotFoundException('Symptome introuvable.');
    }
    return this.prisma.symptom.delete({ where: { id: symptomId } });
  }

  // --- Diagnostic Tests -------------------------------------------------

  async addDiagnosticTest(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
    dto: CreateDiagnosticTestDto,
  ) {
    const diagnosis = await this.getEditableDiagnosis(garageId, userId, userRole, workOrderId);
    return this.prisma.diagnosticTest.create({
      data: { diagnosisId: diagnosis.id, label: dto.label },
    });
  }

  async updateDiagnosticTest(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
    testId: string,
    dto: UpdateDiagnosticTestDto,
  ) {
    const diagnosis = await this.getEditableDiagnosis(garageId, userId, userRole, workOrderId);
    const test = await this.prisma.diagnosticTest.findUnique({ where: { id: testId } });
    if (!test || test.diagnosisId !== diagnosis.id) {
      throw new NotFoundException('Test de diagnostic introuvable.');
    }
    return this.prisma.diagnosticTest.update({ where: { id: testId }, data: dto });
  }

  async removeDiagnosticTest(
    garageId: string,
    userId: string,
    userRole: Role,
    workOrderId: string,
    testId: string,
  ) {
    const diagnosis = await this.getEditableDiagnosis(garageId, userId, userRole, workOrderId);
    const test = await this.prisma.diagnosticTest.findUnique({ where: { id: testId } });
    if (!test || test.diagnosisId !== diagnosis.id) {
      throw new NotFoundException('Test de diagnostic introuvable.');
    }
    return this.prisma.diagnosticTest.delete({ where: { id: testId } });
  }
}
