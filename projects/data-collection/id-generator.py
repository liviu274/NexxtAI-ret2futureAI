import random
from datetime import datetime, timedelta
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing, Rect, String

def generate_random_cnp_length_id():
    # 13-digit random numerical string matching CNP length
    return "".join([str(random.randint(1, 9))] + [str(random.randint(0, 9)) for _ in range(12)])

def generate_gym_id_pdf(filename="gym_membership_card.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        rightMargin=180,
        leftMargin=180,
        topMargin=200,
        bottomMargin=200
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Typography Styles
    title_style = ParagraphStyle(
        'CardTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#1A202C"),
        alignment=1
    )
    
    subtitle_style = ParagraphStyle(
        'CardSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#718096"),
        alignment=1
    )
    
    label_style = ParagraphStyle(
        'FieldLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#4A5568")
    )
    
    value_style = ParagraphStyle(
        'FieldValue',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=12,
        textColor=colors.HexColor("#1A202C")
    )

    story = []

    # Header
    story.append(Paragraph("APEX FITNESS CLUB", title_style))
    story.append(Paragraph("OFFICIAL MEMBER IDENTIFICATION", subtitle_style))
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CBD5E0"), spaceAfter=15))

    # Random Mock Data
    first_names = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley"]
    last_names = ["Morgan", "Vance", "Ellis", "Hayes", "Bennett", "Rivera"]
    
    full_name = f"{random.choice(first_names)} {random.choice(last_names)}"
    birth_date = (datetime(1985, 1, 1) + timedelta(days=random.randint(0, 11000))).strftime("%Y-%m-%d")
    client_number = generate_random_cnp_length_id()
    issue_date = datetime.now().strftime("%Y-%m-%d")

    # Photo Placeholder Graphic
    d = Drawing(80, 95)
    d.add(Rect(0, 0, 80, 95, fillColor=colors.HexColor("#EDF2F7"), strokeColor=colors.HexColor("#CBD5E0"), strokeWidth=1))
    d.add(String(20, 42, "[ PHOTO ]", fontName="Helvetica-Bold", fontSize=8, fillColor=colors.HexColor("#A0AEC0")))

    # Field Layout Table
    data_table_content = [
        [Paragraph("Full Name:", label_style), Paragraph(full_name, value_style)],
        [Paragraph("Birthdate:", label_style), Paragraph(birth_date, value_style)],
        [Paragraph("Client ID:", label_style), Paragraph(client_number, value_style)],
        [Paragraph("Issued:", label_style), Paragraph(issue_date, value_style)],
        [Paragraph("Status:", label_style), Paragraph("ACTIVE / VIP", value_style)],
    ]

    field_table = Table(data_table_content, colWidths=[65, 115])
    field_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))

    # Main Card Layout Table
    card_grid = Table([[d, field_table]], colWidths=[90, 180])
    card_grid.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
    ]))
    
    story.append(card_grid)
    story.append(Spacer(1, 15))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#E2E8F0"), spaceAfter=10))
    story.append(Paragraph("Non-Transferable • Property of Apex Fitness Club", subtitle_style))

    # Outer Container Frame (Card Border Box)
    container_table = Table([[story]], colWidths=[290])
    container_table.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1.5, colors.HexColor("#2B6CB0")),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#F7FAFC")),
        ('TOPPADDING', (0, 0), (-1, -1), 16),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 16),
        ('LEFTPADDING', (0, 0), (-1, -1), 16),
        ('RIGHTPADDING', (0, 0), (-1, -1), 16),
    ]))

    doc.build([container_table])

if __name__ == "__main__":
    generate_gym_id_pdf()