namespace RuleMaker
{
	partial class FormMain
	{
		/// <summary>
		/// Required designer variable.
		/// </summary>
		private System.ComponentModel.IContainer components = null;

		/// <summary>
		/// Clean up any resources being used.
		/// </summary>
		/// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
		protected override void Dispose(bool disposing)
		{
			if (disposing && (components != null))
			{
				components.Dispose();
			}
			base.Dispose(disposing);
		}

		#region Windows Form Designer generated code

		/// <summary>
		/// Required method for Designer support - do not modify
		/// the contents of this method with the code editor.
		/// </summary>
		private void InitializeComponent()
		{
			this.btnChecksum = new System.Windows.Forms.Button();
			this.SuspendLayout();
			// 
			// btnChecksum
			// 
			this.btnChecksum.Location = new System.Drawing.Point(12, 24);
			this.btnChecksum.Name = "btnChecksum";
			this.btnChecksum.Size = new System.Drawing.Size(115, 57);
			this.btnChecksum.TabIndex = 0;
			this.btnChecksum.Text = "Generate File Checksum";
			this.btnChecksum.UseVisualStyleBackColor = true;
			this.btnChecksum.Click += new System.EventHandler(this.btnChecksum_Click);
			// 
			// FormMain
			// 
			this.AutoScaleDimensions = new System.Drawing.SizeF(6F, 12F);
			this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
			this.ClientSize = new System.Drawing.Size(506, 369);
			this.Controls.Add(this.btnChecksum);
			this.Name = "FormMain";
			this.Text = "切换规则生成器";
			this.ResumeLayout(false);

		}

		#endregion

		private System.Windows.Forms.Button btnChecksum;
	}
}

